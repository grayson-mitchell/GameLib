//! Port of `library.updatePollOnce.test.ts` and the InstallApp cases of `steamInstallApp.test.ts`.
//! The mapping table is in 80-12-SUMMARY.md.

use gamelib_steampoll::acf_state::{AcfSource, AcfUpdateFields};
use gamelib_steampoll::constants::{
    STEAM_INSTALLAPP_RETRY_EVERY_TICKS, STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS,
    STEAM_REQUEST_NO_ACTIVITY_TICKS, STEAM_UPDATE_ABANDONED_TICKS,
};
use gamelib_steampoll::effects::{Continuation, Effect, LogLevel};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::host::{BoxFuture, Notification, PollHost, RunOutput};
use gamelib_steampoll::monitor::DownloadReading;
use gamelib_steampoll::testing::ScriptedRunner;
use gamelib_steampoll::update::{
    format_file_size, request_steam_install_app, update_step, AwaitingUpdate,
    SteamInstallAppOutcome, UpdateObservation, UpdateStep,
};
use serde_json::{json, Value};
use std::path::PathBuf;

const APP: &str = "333300";

fn fields(stage: u32, buildid: &str, target: Option<&str>) -> AcfUpdateFields {
    AcfUpdateFields {
        steamapps_dir: "/s".into(),
        buildid: buildid.into(),
        target_build_id: target.map(str::to_string),
        state_flags: stage,
        bytes_to_download: 0,
        bytes_downloaded: 0,
        scheduled_auto_update: 0,
        beta_key: None,
    }
}

fn obs(f: Option<AcfUpdateFields>) -> UpdateObservation {
    UpdateObservation {
        fields: f,
        monitor: None,
        install_app_outcome: None,
        seq: 1,
        is_mac: false,
    }
}

fn step(a: &mut AwaitingUpdate, ticks: u32, f: AcfUpdateFields) -> UpdateStep {
    update_step(a, ticks, AcfSource::Native, APP, &obs(Some(f)))
}

fn statuses(effects: &[Effect]) -> Vec<String> {
    effects
        .iter()
        .filter_map(|e| match e {
            Effect::Frontend { channel, args } if channel == "gameStatusUpdate" => {
                args[0]["status"].as_str().map(str::to_string)
            }
            _ => None,
        })
        .collect()
}

fn has_log(effects: &[Effect], needle: &str) -> bool {
    effects
        .iter()
        .any(|e| matches!(e, Effect::Log { message, .. } if message.contains(needle)))
}

fn update_done(effects: &[Effect]) -> Option<(bool, Continuation)> {
    effects.iter().find_map(|e| match e {
        Effect::Transition {
            event: StateEvent::UpdateDone { completed, .. },
            then,
        } => Some((*completed, then.clone())),
        _ => None,
    })
}

fn progress_payload(effects: &[Effect]) -> Option<Value> {
    effects.iter().find_map(|e| match e {
        Effect::Frontend { channel, args } if channel == "progressUpdate" => Some(args[0].clone()),
        _ => None,
    })
}

// ---- update_step ----------------------------------------------------------------------------

#[test]
fn pending_reports_updating_managed_by_steam() {
    let mut a = AwaitingUpdate::new("100", None, 0);
    let s = step(&mut a, 1, fields(6, "100", Some("200")));
    assert!(!s.stop);
    assert_eq!(
        s.effects[0],
        Effect::Frontend {
            channel: "gameStatusUpdate".into(),
            args: vec![
                json!({"appName": APP, "runner": "steam", "status": "updating", "managedBySteam": true})
            ],
        }
    );
}

#[test]
fn derives_percent_from_acf_byte_counters() {
    let mut a = AwaitingUpdate::new("100", None, 0);
    let mut f = fields(6, "100", None);
    f.bytes_downloaded = 936_064;
    f.bytes_to_download = 1_872_128;
    let s = step(&mut a, 1, f);
    let p = progress_payload(&s.effects).expect("progressUpdate");
    assert_eq!(p["progress"]["percent"], json!(50));
    assert_eq!(p["progress"]["bytes"], json!("914.13 KiB"));
    assert_eq!(p["progress"]["eta"], json!(""));
    assert_eq!(p["status"], json!("updating"));
}

#[test]
fn bit4_alone_never_completes() {
    // StateFlags 4 at the starting build with a different target: never completion, any tick count.
    let mut a = AwaitingUpdate::new("100", None, 0);
    for t in 1..STEAM_REQUEST_NO_ACTIVITY_TICKS {
        let s = step(&mut a, t, fields(4, "100", Some("200")));
        assert!(!s.stop, "tick {t}");
        assert!(update_done(&s.effects).is_none());
    }
}

#[test]
fn completes_when_no_longer_pending_and_bit4_set() {
    let mut a = AwaitingUpdate::new("100", None, 0);
    step(&mut a, 1, fields(6, "100", Some("200")));
    let s = step(&mut a, 2, fields(4, "200", Some("200")));
    assert!(s.stop);
    let (completed, then) = update_done(&s.effects).expect("updateDone");
    assert!(completed);
    assert_eq!(
        then,
        Continuation::UpdateDone {
            app_id: APP.into(),
            completed: true
        }
    );
}

#[test]
fn build_change_completes() {
    let mut a = AwaitingUpdate::new("100", Some("200"), 0);
    let s = step(&mut a, 1, fields(4, "200", None));
    assert!(s.stop);
    assert!(has_log(
        &s.effects,
        "Steam: update of appId 333300 finished (build 200)"
    ));
    let (completed, then) = update_done(&s.effects).unwrap();
    assert!(completed);
    // after the ack the continuation sends updating (managedBySteam) then done
    let after = then.resolve(&AckReply {
        applied: true,
        ..AckReply::default()
    });
    assert_eq!(statuses(&after), ["updating", "done"]);
    assert_eq!(
        after[0],
        Effect::Frontend {
            channel: "gameStatusUpdate".into(),
            args: vec![
                json!({"appName": APP, "runner": "steam", "status": "updating", "managedBySteam": true})
            ],
        }
    );
}

#[test]
fn quiet_end_completes_when_acf_already_current() {
    let mut a = AwaitingUpdate::new("100", None, 0);
    let s = step(
        &mut a,
        STEAM_REQUEST_NO_ACTIVITY_TICKS,
        fields(4, "100", None),
    );
    assert!(s.stop);
    assert!(update_done(&s.effects).unwrap().0);
    // the tick's own progress 'updating' is not emitted before a completion transition
    assert!(statuses(&s.effects).len() <= 1);
}

#[test]
fn quiet_end_with_unmet_target_does_not_complete() {
    let mut a = AwaitingUpdate::new("777", Some("800"), 0);
    let s = step(
        &mut a,
        STEAM_REQUEST_NO_ACTIVITY_TICKS,
        fields(4, "777", None),
    );
    assert!(s.stop);
    // the tick's own progress 'updating' precedes the quiet 'done'; a completion would add a second
    assert_eq!(statuses(&s.effects), ["updating", "done"]);
    assert!(has_log(&s.effects, "ending the update poll quietly"));
    assert!(!has_log(&s.effects, "finished"));
    let (completed, then) = update_done(&s.effects).unwrap();
    assert!(!completed);
    assert_eq!(then, Continuation::None);
}

#[test]
fn uat19_stale_acf_for_40_ticks_ends_quietly() {
    let mut a = AwaitingUpdate::new("5820077", Some("5820078"), 0);
    let mut ended = None;
    for t in 1..=STEAM_REQUEST_NO_ACTIVITY_TICKS {
        let s = step(&mut a, t, fields(4, "5820077", Some("5820077")));
        assert!(!has_log(&s.effects, "finished (build 5820077)"));
        if s.stop {
            ended = Some((t, s));
        }
    }
    let (t, s) = ended.expect("ended");
    assert_eq!(t, STEAM_REQUEST_NO_ACTIVITY_TICKS);
    assert!(has_log(&s.effects, "ending the update poll quietly"));
    assert_eq!(
        statuses(&s.effects).iter().filter(|x| *x == "done").count(),
        1
    );
    assert!(!update_done(&s.effects).unwrap().0);
}

#[test]
fn uat19_reaching_pics_target_logs_finished() {
    let mut a = AwaitingUpdate::new("5820077", Some("5820078"), 0);
    let s = step(&mut a, 5, fields(4, "5820078", Some("5820078")));
    assert!(s.stop);
    assert!(has_log(
        &s.effects,
        "Steam: update of appId 333300 finished (build 5820078)"
    ));
}

#[test]
fn quiet_end_no_known_target_completes_when_current() {
    let mut a = AwaitingUpdate::new("777", None, 0);
    let s = step(
        &mut a,
        STEAM_REQUEST_NO_ACTIVITY_TICKS,
        fields(4, "777", None),
    );
    assert!(update_done(&s.effects).unwrap().0);
}

#[test]
fn quiet_end_at_target_build_completes() {
    let mut a = AwaitingUpdate::new("777", Some("800"), 0);
    let s = step(
        &mut a,
        STEAM_REQUEST_NO_ACTIVITY_TICKS,
        fields(4, "800", None),
    );
    assert!(update_done(&s.effects).unwrap().0);
}

fn downloading() -> AcfUpdateFields {
    let mut f = fields(0x106, "777", Some("800"));
    f.bytes_to_download = 1000;
    f.bytes_downloaded = 400;
    f
}

fn settled() -> AcfUpdateFields {
    let mut f = fields(4, "777", Some("777"));
    f.bytes_to_download = 1000;
    f.bytes_downloaded = 400;
    f
}

#[test]
fn abandoned_after_settled_ticks() {
    let mut a = AwaitingUpdate::new("777", Some("800"), 0);
    let mut t = 1;
    step(&mut a, t, downloading());
    assert!(a.saw_activity);
    for _ in 0..STEAM_UPDATE_ABANDONED_TICKS - 1 {
        t += 1;
        assert!(!step(&mut a, t, settled()).stop);
    }
    t += 1;
    let s = step(&mut a, t, settled());
    assert!(s.stop);
    assert!(has_log(
        &s.effects,
        "Steam: update of appId 333300 settled back at build 777 for 20 ticks; ending the update poll quietly"
    ));
    assert!(!has_log(&s.effects, "finished"));
    // quiet end only: no 'updating' before done
    assert_eq!(statuses(&s.effects), ["done"]);
    assert!(!update_done(&s.effects).unwrap().0);
}

#[test]
fn settled_read_between_active_ticks_restarts_count() {
    let mut a = AwaitingUpdate::new("777", Some("800"), 0);
    let mut t = 1;
    step(&mut a, t, downloading());
    for _ in 0..STEAM_UPDATE_ABANDONED_TICKS - 1 {
        t += 1;
        step(&mut a, t, settled());
    }
    t += 1;
    step(&mut a, t, downloading());
    for _ in 0..STEAM_UPDATE_ABANDONED_TICKS - 1 {
        t += 1;
        assert!(!step(&mut a, t, settled()).stop);
    }
    assert_eq!(a.settled_at_start_ticks, STEAM_UPDATE_ABANDONED_TICKS - 1);
}

#[test]
fn reaching_target_after_settled_spell_still_finishes() {
    let mut a = AwaitingUpdate::new("777", Some("800"), 0);
    let mut t = 1;
    step(&mut a, t, downloading());
    for _ in 0..5 {
        t += 1;
        step(&mut a, t, settled());
    }
    t += 1;
    let s = step(&mut a, t, fields(4, "800", Some("800")));
    assert!(has_log(
        &s.effects,
        "Steam: update of appId 333300 finished (build 800)"
    ));
}

#[test]
fn quiet_end_on_no_activity() {
    let mut a = AwaitingUpdate::new("100", None, 0);
    let s = step(
        &mut a,
        STEAM_REQUEST_NO_ACTIVITY_TICKS,
        fields(6, "100", Some("200")),
    );
    assert!(s.stop);
    assert_eq!(
        statuses(&s.effects).last().map(String::as_str),
        Some("done")
    );
    assert!(!update_done(&s.effects).unwrap().0);
    assert!(!s.effects.iter().any(|e| matches!(e, Effect::Notify(_))));
    assert!(!s.effects.iter().any(|e| matches!(
        e,
        Effect::Frontend { channel, .. } if channel == "steamRequestNotice"
    )));
}

#[test]
fn live_progress_on_mac_native_uses_monitor_reading() {
    let mut a = AwaitingUpdate::new("100", None, 0);
    let mut o = obs(Some({
        let mut f = fields(6, "100", None);
        f.bytes_downloaded = 100;
        f.bytes_to_download = 1000;
        f
    }));
    o.is_mac = true;
    o.monitor = Some(DownloadReading {
        bytes_done: 500.0,
        bytes_total: 1000.0,
        speed_bytes_per_sec: None,
    });
    let s = update_step(&mut a, 1, AcfSource::Native, APP, &o);
    assert_eq!(
        progress_payload(&s.effects).unwrap()["progress"]["percent"],
        json!(50)
    );
    // the reading is ignored off macOS and for non-native polls
    let mut b = AwaitingUpdate::new("100", None, 0);
    let s = update_step(&mut b, 1, AcfSource::Bottle, APP, &o);
    assert_eq!(
        progress_payload(&s.effects).unwrap()["progress"]["percent"],
        json!(10)
    );
}

#[test]
fn file_size_matches_filesize_base2() {
    assert_eq!(format_file_size(0.0), "0 B");
    assert_eq!(format_file_size(512.0), "512 B");
    assert_eq!(format_file_size(1536.0), "1.5 KiB");
    assert_eq!(format_file_size(1_872_128.0), "1.79 MiB");
    assert_eq!(format_file_size(1_048_574.976), "1 MiB");
}

// ---- InstallApp retry -----------------------------------------------------------------------

fn armed() -> AwaitingUpdate {
    AwaitingUpdate::new("100", Some("200"), 0).with_retry(Some("/lib"))
}

fn stale() -> AcfUpdateFields {
    fields(4, "100", Some("100"))
}

fn pending_idle() -> AcfUpdateFields {
    let mut f = fields(6, "100", Some("200"));
    f.bytes_to_download = 1000;
    f
}

fn with_outcome(o: SteamInstallAppOutcome) -> UpdateObservation {
    let mut x = obs(Some(stale()));
    x.install_app_outcome = Some(o);
    x
}

#[test]
fn installapp_retry_cadence() {
    let mut a = armed();
    let mut requested = vec![];
    for t in 1..=12 {
        // never overlapping: the outcome is fed only after the request tick, so the in-flight
        // request is not repeated on later due ticks
        let s = step(&mut a, t, stale());
        if let Some(path) = s.request_install_app {
            assert_eq!(path.as_deref(), Some("/lib"));
            requested.push(t);
        }
    }
    assert_eq!(requested, vec![3], "one in flight: no second request");
    // outcomes unavailable: a request every STEAM_INSTALLAPP_RETRY_EVERY_TICKS
    let mut a = armed();
    let mut requested = vec![];
    for t in 1..=12 {
        let mut o = obs(Some(stale()));
        if requested.last().is_some_and(|r| t == r + 1) {
            o.install_app_outcome = Some(SteamInstallAppOutcome::Unavailable {
                reason: "steam-not-running".into(),
            });
        }
        let s = update_step(&mut a, t, AcfSource::Native, APP, &o);
        if s.request_install_app.is_some() {
            requested.push(t);
        }
    }
    assert_eq!(requested, vec![3, 6, 9, 12]);
    assert_eq!(STEAM_INSTALLAPP_RETRY_EVERY_TICKS, 3);
}

#[test]
fn installapp_ok_logs_disarms_and_restarts_quiet_window() {
    let mut a = armed();
    let t = STEAM_INSTALLAPP_RETRY_EVERY_TICKS;
    let s = step(&mut a, t, stale());
    assert!(s.request_install_app.is_some());
    let s = update_step(
        &mut a,
        t + 1,
        AcfSource::Native,
        APP,
        &with_outcome(SteamInstallAppOutcome::Ok { folder_index: 0 }),
    );
    assert!(has_log(
        &s.effects,
        "SteamGame: Steam is updating appId 333300 via InstallApp (retry after Steam start)"
    ));
    assert!(a.install_app_retry.is_none());
    assert_eq!(a.delegated_since_tick, t);
}

#[test]
fn installapp_unavailable_counts_attempts_and_gives_up_at_max() {
    let mut a = armed();
    let unavailable = SteamInstallAppOutcome::Unavailable {
        reason: "steam-not-running".into(),
    };
    step(&mut a, 3, stale());
    update_step(
        &mut a,
        4,
        AcfSource::Native,
        APP,
        &with_outcome(unavailable.clone()),
    );
    assert_eq!(a.install_app_retry.as_ref().unwrap().attempts, 1);

    a.install_app_retry.as_mut().unwrap().attempts = STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS - 1;
    assert!(step(&mut a, 6, stale()).request_install_app.is_some());
    let s = update_step(
        &mut a,
        7,
        AcfSource::Native,
        APP,
        &with_outcome(unavailable),
    );
    assert!(a.install_app_retry.is_none());
    assert!(has_log(
        &s.effects,
        "InstallApp retry for appId 333300 gave up after"
    ));
}

#[test]
fn installapp_error_disarms_and_logs_code() {
    let mut a = armed();
    step(&mut a, 3, stale());
    let s = update_step(
        &mut a,
        4,
        AcfSource::Native,
        APP,
        &with_outcome(SteamInstallAppOutcome::Error { code: 9 }),
    );
    assert!(a.install_app_retry.is_none());
    assert!(s.effects.iter().any(|e| matches!(
        e,
        Effect::Log { level: LogLevel::Warn, message } if message.contains("EAppUpdateError 9")
    )));
    assert!(!s.stop);
}

#[test]
fn uat25_retries_on_pending_but_idle_acf_same_tick() {
    let mut a = armed();
    let s = step(&mut a, 3, pending_idle());
    assert!(s.request_install_app.is_some());
}

#[test]
fn uat25_retries_on_due_tick_after_earlier_saw_pending() {
    let mut a = armed();
    let s = step(&mut a, 1, pending_idle());
    assert!(a.saw_pending);
    assert!(s.request_install_app.is_none());
    let s = step(&mut a, 3, pending_idle());
    assert!(s.request_install_app.is_some());
}

#[test]
fn never_retries_once_real_activity_seen() {
    let mut a = armed();
    let s = step(&mut a, 3, fields(0x106, "100", Some("200")));
    assert!(s.request_install_app.is_none());
}

#[test]
fn uat25_growing_bytes_under_update_required_disarms_retry() {
    let mut a = armed();
    step(&mut a, 1, fields(6, "100", Some("200")));
    let mut f = fields(6, "100", Some("200"));
    f.bytes_downloaded = 500;
    let s = step(&mut a, 3, f);
    assert!(a.saw_activity);
    assert!(s.request_install_app.is_none());
}

#[test]
fn uat25_never_logs_finished_at_stale_starting_build() {
    let mut a = armed();
    step(&mut a, 1, pending_idle());
    let s = step(&mut a, 2, stale());
    assert!(!s.stop);
    assert!(!has_log(&s.effects, "finished (build 100)"));
}

#[test]
fn uat25_finishes_once_target_build_reached() {
    let mut a = armed();
    step(&mut a, 1, pending_idle());
    let s = step(&mut a, 2, fields(4, "200", Some("200")));
    assert!(has_log(
        &s.effects,
        "Steam: update of appId 333300 finished (build 200)"
    ));
}

// ---- InstallApp helper request --------------------------------------------------------------

struct HelperHost(Option<PathBuf>);

impl PollHost for HelperHost {
    fn emit_frontend(&self, _: &str, _: Vec<Value>) {}
    fn notify(&self, _: Notification) {}
    fn state_event(&self, _: StateEvent) -> BoxFuture<AckReply> {
        Box::pin(async { AckReply::default() })
    }
    fn bridge_helper_path(&self) -> Option<PathBuf> {
        self.0.clone()
    }
    fn shell_pid(&self) -> u32 {
        1
    }
}

fn out(code: Option<i32>, stdout: &str) -> RunOutput {
    RunOutput {
        code,
        stdout: stdout.into(),
        stderr: String::new(),
    }
}

fn helper() -> (tempfile::TempDir, HelperHost, String) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("steam-bridge-helper");
    std::fs::write(&path, "").unwrap();
    let p = path.to_string_lossy().into_owned();
    (dir, HelperHost(Some(path)), p)
}

fn unavailable(reason: &str) -> SteamInstallAppOutcome {
    SteamInstallAppOutcome::Unavailable {
        reason: reason.into(),
    }
}

#[tokio::test]
async fn installapp_maps_an_ok_line_with_library() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    runner.on(
        &format!("{p} --steam-installapp 12345 --library /lib x"),
        vec![out(Some(0), r#"{"result":"ok","folderIndex":2}"#)],
    );
    let r = request_steam_install_app(&host, &runner, "12345", Some("/lib x")).await;
    assert_eq!(r, SteamInstallAppOutcome::Ok { folder_index: 2 });
}

#[tokio::test]
async fn installapp_omits_library_when_none() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    runner.on(
        &format!("{p} --steam-installapp 12345"),
        vec![out(Some(0), r#"{"result":"ok"}"#)],
    );
    let r = request_steam_install_app(&host, &runner, "12345", None).await;
    assert_eq!(r, SteamInstallAppOutcome::Ok { folder_index: 0 });
    assert_eq!(
        runner.calls(),
        vec![format!("{p} --steam-installapp 12345")]
    );
}

#[tokio::test]
async fn installapp_maps_unavailable_and_error_lines() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    let key = format!("{p} --steam-installapp 1");
    runner.on(
        &key,
        vec![out(
            Some(0),
            r#"{"result":"unavailable","reason":"steam-not-running"}"#,
        )],
    );
    assert_eq!(
        request_steam_install_app(&host, &runner, "1", None).await,
        unavailable("steam-not-running")
    );
    runner.on(
        &key,
        vec![out(Some(1), r#"{"result":"error","eAppUpdateError":18}"#)],
    );
    assert_eq!(
        request_steam_install_app(&host, &runner, "1", None).await,
        SteamInstallAppOutcome::Error { code: 18 }
    );
}

#[tokio::test]
async fn installapp_uses_last_non_empty_stdout_line() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    runner.on(
        &format!("{p} --steam-installapp 1"),
        vec![out(
            Some(0),
            "noise\n{\"result\":\"error\",\"eAppUpdateError\":1}\n{\"result\":\"ok\",\"folderIndex\":1}\n\n",
        )],
    );
    assert_eq!(
        request_steam_install_app(&host, &runner, "1", None).await,
        SteamInstallAppOutcome::Ok { folder_index: 1 }
    );
}

#[tokio::test]
async fn installapp_maps_no_json_timeout_and_junk_to_helper_failed() {
    let (_d, host, p) = helper();
    let runner = ScriptedRunner::default();
    let key = format!("{p} --steam-installapp 1");
    for o in [
        out(Some(1), "not json"),
        out(None, ""),
        out(Some(0), ""),
        out(Some(0), r#"{"result":"weird"}"#),
        out(Some(0), r#"{"result":"error"}"#),
        out(Some(0), "[1,2]"),
    ] {
        runner.on(&key, vec![o]);
        assert_eq!(
            request_steam_install_app(&host, &runner, "1", None).await,
            unavailable("helper-failed")
        );
    }
}

#[tokio::test]
async fn installapp_missing_helper_does_not_spawn() {
    let runner = ScriptedRunner::default();
    let r = request_steam_install_app(&HelperHost(None), &runner, "1", None).await;
    assert_eq!(r, unavailable("helper-missing"));
    let gone = HelperHost(Some(PathBuf::from("/nonexistent/steam-bridge-helper")));
    let r = request_steam_install_app(&gone, &runner, "1", None).await;
    assert_eq!(r, unavailable("helper-missing"));
    assert!(runner.calls().is_empty());
}

#[tokio::test]
async fn installapp_bad_appid_does_not_spawn() {
    let (_d, host, _p) = helper();
    let runner = ScriptedRunner::default();
    for bad in ["", "abc", "12 34", "12345678901", "1;rm", "-1"] {
        assert_eq!(
            request_steam_install_app(&host, &runner, bad, None).await,
            unavailable("bad-appid"),
            "{bad:?}"
        );
    }
    assert!(runner.calls().is_empty());
}
