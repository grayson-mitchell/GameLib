//! Port of `library.uninstallPolling.test.ts`. The mapping table is in 80-13-SUMMARY.md.
//!
//! Step tests feed synthetic observations; loop tests run the real ACF readers over a temp
//! steamapps root against `RecordingHost` under paused time.

use gamelib_steamfiles::acf::{write_app_manifest, AppManifestParams};
use gamelib_steampoll::acf_state::{AcfSource, AcfState, PollRoots};
use gamelib_steampoll::constants::{MAX_TICKS, STEAM_REQUEST_NO_ACTIVITY_TICKS};
use gamelib_steampoll::effects::{Continuation, Effect, LogLevel};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::outbox::Outbox;
use gamelib_steampoll::registry::{PollKind, Registry};
use gamelib_steampoll::testing::{AckMode, FakeClock, RecordingHost, ScriptedRunner, StreamRecord};
use gamelib_steampoll::uninstall::{
    start_uninstall, stop_uninstall, uninstall_step, StartUninstallArgs, UninstallObservation,
    UninstallPoll,
};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;

const APP: &str = "200510";

fn installed(path: &str, flags: u32) -> AcfState {
    AcfState::Installed {
        state_flags: flags,
        install_path: path.into(),
        size_on_disk: "9000".into(),
        buildid: Some("7".into()),
    }
}

fn obs(
    state: AcfState,
    others: Vec<(AcfSource, AcfState)>,
    bridge_auth: bool,
) -> UninstallObservation {
    UninstallObservation {
        state,
        others,
        bridge_authoritative: bridge_auth,
        seq: 9,
    }
}

fn run(poll: &mut UninstallPoll, o: &UninstallObservation) -> (Vec<Effect>, bool) {
    uninstall_step(poll, APP, o, &mut || 77)
}

fn event_kinds(effects: &[Effect]) -> Vec<&'static str> {
    effects
        .iter()
        .filter_map(|e| match e {
            Effect::Transition { event, .. } => Some(event.kind()),
            _ => None,
        })
        .collect()
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

fn uninstalled_event(effects: &[Effect]) -> StateEvent {
    effects
        .iter()
        .find_map(|e| match e {
            Effect::Transition { event, .. } if event.kind() == "uninstalled" => {
                Some(event.clone())
            }
            _ => None,
        })
        .expect("an uninstalled transition")
}

// ---- pure step ----

#[test]
fn absent_native_completes_with_uninstalled_event_and_done_continuation() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Bottle, AcfState::Absent),
            (AcfSource::Bridge, AcfState::Absent),
        ],
        false,
    );
    let (fx, stop) = run(&mut p, &o);
    assert!(stop);
    assert_eq!(event_kinds(&fx), vec!["uninstalled"]);
    match &fx[0] {
        Effect::Transition { event, then } => {
            assert!(
                matches!(event, StateEvent::Uninstalled { survivor: None, source, .. } if source == "native")
            );
            assert!(matches!(
                then,
                Continuation::Uninstalled {
                    survivor_source: None,
                    ..
                }
            ));
            // The continuation yields done then the "Game Uninstalled" notice.
            let after = then.clone().resolve(&AckReply {
                applied: true,
                title: Some("Game".into()),
                ..AckReply::default()
            });
            assert_eq!(statuses(&after), vec!["done"]);
            assert!(
                matches!(&after[1], Effect::Notify(n) if matches!(&n.body, gamelib_steampoll::host::NotifyText::Key { key, .. } if key == "notify.uninstalled"))
            );
        }
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn present_with_0x800_reports_uninstalling_and_marks_seen() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    let (fx, stop) = run(&mut p, &obs(installed("/g", 2052), vec![], false));
    assert!(!stop);
    assert_eq!(statuses(&fx), vec!["uninstalling"]);
    assert!(p.seen_uninstalling);
}

#[test]
fn downloading_manifest_also_reports_uninstalling() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    let st = AcfState::Downloading {
        state_flags: Some(1026),
        bytes_downloaded: 0,
        bytes_to_download: 0,
        bytes_staged: 0,
        bytes_to_stage: 0,
    };
    let (fx, _) = run(&mut p, &obs(st, vec![], false));
    assert_eq!(statuses(&fx), vec!["uninstalling"]);
}

#[test]
fn fully_installed_without_bit_does_not_flip_or_report() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    let (fx, stop) = run(&mut p, &obs(installed("/g", 4), vec![], false));
    assert!(!stop);
    assert!(fx.is_empty());
    assert!(!p.seen_uninstalling);
}

#[test]
fn unknown_read_is_not_a_confirmed_absence() {
    let mut p = UninstallPoll::new(AcfSource::Bottle, "Game");
    let (fx, stop) = run(&mut p, &obs(AcfState::Unknown, vec![], false));
    assert!(!stop);
    assert!(event_kinds(&fx).is_empty());
}

#[test]
fn survivor_root_unknown_defers_completion() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Bottle, AcfState::Unknown),
            (AcfSource::Bridge, AcfState::Absent),
        ],
        false,
    );
    let (fx, stop) = run(&mut p, &o);
    assert!(!stop);
    assert!(event_kinds(&fx).is_empty());
    assert!(fx.iter().any(|e| matches!(
        e,
        Effect::Log {
            level: LogLevel::Warn,
            ..
        }
    )));
}

#[test]
fn bottle_absent_clears_forced_verdict_first_even_when_deferring() {
    let mut p = UninstallPoll::new(AcfSource::Bottle, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Native, AcfState::Unknown),
            (AcfSource::Bridge, AcfState::Absent),
        ],
        false,
    );
    let (fx, stop) = run(&mut p, &o);
    assert!(!stop);
    assert_eq!(event_kinds(&fx), vec!["forcedWindowsViaBottleCleared"]);
}

#[test]
fn bottle_absent_full_uninstall_orders_cleared_then_uninstalled() {
    let mut p = UninstallPoll::new(AcfSource::Bottle, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Native, AcfState::Absent),
            (AcfSource::Bridge, AcfState::Absent),
        ],
        false,
    );
    let (fx, stop) = run(&mut p, &o);
    assert!(stop);
    assert_eq!(
        event_kinds(&fx),
        vec!["forcedWindowsViaBottleCleared", "uninstalled"]
    );
}

#[test]
fn bridge_absent_clears_verdict_and_emits_bridge_uninstalled_before_uninstalled() {
    let mut p = UninstallPoll::new(AcfSource::Bridge, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Native, AcfState::Absent),
            (AcfSource::Bottle, AcfState::Absent),
        ],
        false,
    );
    let (fx, stop) = run(&mut p, &o);
    assert!(stop);
    assert_eq!(
        event_kinds(&fx),
        vec![
            "forcedWindowsViaBottleCleared",
            "bridgeUninstalled",
            "uninstalled"
        ]
    );
}

#[test]
fn native_absent_does_not_clear_forced_verdict() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Bottle, AcfState::Absent),
            (AcfSource::Bridge, AcfState::Absent),
        ],
        false,
    );
    let (fx, _) = run(&mut p, &o);
    assert!(!event_kinds(&fx).contains(&"forcedWindowsViaBottleCleared"));
}

#[test]
fn bottle_still_present_does_not_clear_forced_verdict() {
    let mut p = UninstallPoll::new(AcfSource::Bottle, "Game");
    let (fx, _) = run(&mut p, &obs(installed("/b", 4), vec![], false));
    assert!(event_kinds(&fx).is_empty());
}

#[test]
fn bottle_removed_native_survives() {
    let mut p = UninstallPoll::new(AcfSource::Bottle, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Native, installed("/native/g", 4)),
            (AcfSource::Bridge, AcfState::Absent),
        ],
        false,
    );
    let (fx, stop) = run(&mut p, &o);
    assert!(stop);
    match uninstalled_event(&fx) {
        StateEvent::Uninstalled {
            survivor: Some(s),
            source,
            ..
        } => {
            assert_eq!(source, "bottle");
            assert_eq!(s.source, "native");
            assert_eq!(s.install_path, "/native/g");
            assert_eq!(s.size_on_disk, "9000");
            assert_eq!(s.buildid.as_deref(), Some("7"));
        }
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn survivor_notice_names_both_copies_with_labels() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Bottle, installed("/b/g", 4)),
            (AcfSource::Bridge, AcfState::Absent),
        ],
        false,
    );
    let (fx, _) = run(&mut p, &o);
    let Effect::Transition { then, .. } = &fx[0] else {
        panic!("no transition")
    };
    let after = then.clone().resolve(&AckReply {
        applied: true,
        title: Some("XCOM".into()),
        ..AckReply::default()
    });
    assert_eq!(statuses(&after), vec!["done"]);
    match &after[1] {
        Effect::Notify(n) => match &n.body {
            gamelib_steampoll::host::NotifyText::Key { key, params, .. } => {
                assert_eq!(key, "gamelib:steam.uninstall.copySurvives");
                assert_eq!(params["removed"], json!("Mac Steam"));
                assert_eq!(params["survivor"], json!("Windows Steam (CrossOver)"));
            }
            other => panic!("unexpected {other:?}"),
        },
        other => panic!("unexpected {other:?}"),
    }
}

#[test]
fn native_removed_only_bridge_survives_uses_probe_order() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Bottle, AcfState::Absent),
            (AcfSource::Bridge, installed("/br/g", 4)),
        ],
        false,
    );
    let (fx, stop) = run(&mut p, &o);
    assert!(stop);
    assert!(
        matches!(uninstalled_event(&fx), StateEvent::Uninstalled { survivor: Some(s), .. } if s.source == "bridge")
    );
}

#[test]
fn bridge_removed_native_survives_no_bridge_uninstalled_event() {
    let mut p = UninstallPoll::new(AcfSource::Bridge, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Native, installed("/n/g", 4)),
            (AcfSource::Bottle, AcfState::Absent),
        ],
        false,
    );
    let (fx, _) = run(&mut p, &o);
    assert_eq!(
        event_kinds(&fx),
        vec!["forcedWindowsViaBottleCleared", "uninstalled"]
    );
}

#[test]
fn bridge_authoritative_title_ignores_native_copy() {
    let mut p = UninstallPoll::new(AcfSource::Bottle, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Native, installed("/n/g", 4)),
            (AcfSource::Bridge, AcfState::Absent),
        ],
        true,
    );
    let (fx, stop) = run(&mut p, &o);
    assert!(stop);
    assert!(matches!(
        uninstalled_event(&fx),
        StateEvent::Uninstalled { survivor: None, .. }
    ));
}

#[test]
fn first_survivor_wins_by_probe_order() {
    let mut p = UninstallPoll::new(AcfSource::Bridge, "Game");
    let o = obs(
        AcfState::Absent,
        vec![
            (AcfSource::Native, installed("/n/g", 4)),
            (AcfSource::Bottle, installed("/b/g", 4)),
        ],
        false,
    );
    let (fx, _) = run(&mut p, &o);
    assert!(
        matches!(uninstalled_event(&fx), StateEvent::Uninstalled { survivor: Some(s), .. } if s.source == "native")
    );
}

#[test]
fn no_activity_for_window_gives_up_with_done_and_notice() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    let o = obs(installed("/g", 4), vec![], false);
    for _ in 0..STEAM_REQUEST_NO_ACTIVITY_TICKS - 1 {
        let (fx, stop) = run(&mut p, &o);
        assert!(!stop);
        assert!(fx.is_empty());
    }
    let (fx, stop) = run(&mut p, &o);
    assert!(stop);
    assert_eq!(statuses(&fx), vec!["done"]);
    let notice = fx.iter().find_map(|e| match e {
        Effect::Frontend { channel, args } if channel == "steamRequestNotice" => {
            Some(args[0].clone())
        }
        _ => None,
    });
    assert_eq!(
        notice,
        Some(json!({"appId": APP, "title": "Game", "kind": "uninstall-not-started", "seq": 77}))
    );
}

#[test]
fn active_uninstall_disarms_the_no_activity_window() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    run(&mut p, &obs(installed("/g", 2052), vec![], false));
    for _ in 0..STEAM_REQUEST_NO_ACTIVITY_TICKS + 5 {
        let (_, stop) = run(&mut p, &obs(installed("/g", 4), vec![], false));
        assert!(!stop);
    }
}

#[test]
fn absent_tick_completes_and_never_fires_the_no_activity_notice() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    p.ticks = STEAM_REQUEST_NO_ACTIVITY_TICKS;
    let (fx, stop) = run(&mut p, &obs(AcfState::Absent, vec![], false));
    assert!(stop);
    assert!(!fx
        .iter()
        .any(|e| matches!(e, Effect::Frontend { channel, .. } if channel == "steamRequestNotice")));
}

#[test]
fn safety_cap_stops_with_no_state_change() {
    let mut p = UninstallPoll::new(AcfSource::Native, "Game");
    p.ticks = MAX_TICKS - 1;
    let (fx, stop) = run(&mut p, &obs(AcfState::Absent, vec![], false));
    assert!(stop);
    assert!(event_kinds(&fx).is_empty());
}

// ---- loop ----

struct Rig {
    reg: Registry,
    host: Arc<RecordingHost>,
    outbox: Arc<Outbox>,
    roots: PollRoots,
    _tmp: TempDir,
    bottle: std::path::PathBuf,
}

fn manifest(flags: &str) -> AppManifestParams {
    AppManifestParams {
        app_id: APP.into(),
        installdir: "Game".into(),
        name: "Game".into(),
        size_on_disk: "9000".into(),
        buildid: Some("7".into()),
        last_owner: None,
        state_flags: Some(flags.into()),
        bytes: None,
        beta_key: None,
        installed_depots: vec![],
    }
}

async fn rig() -> Rig {
    let tmp = TempDir::new().unwrap();
    let steam = tmp.path().join("steam");
    std::fs::create_dir_all(steam.join("steamapps")).unwrap();
    std::fs::write(
        steam.join("steamapps").join("libraryfolders.vdf"),
        format!(
            "\"libraryfolders\"\n{{\n\"0\"\n{{\n\"path\" \"{}\"\n}}\n}}\n",
            steam.display()
        ),
    )
    .unwrap();
    let bottle = tmp.path().join("bottle");
    std::fs::create_dir_all(&bottle).unwrap();
    let host = Arc::new(RecordingHost::new(AckMode::Reply(AckReply {
        applied: true,
        title: Some("Game".into()),
        ..AckReply::default()
    })));
    let outbox = Arc::new(Outbox::new());
    outbox.mark_ready(host.as_ref()).await;
    let reg = Registry::new(
        tokio::runtime::Handle::current(),
        host.clone(),
        Arc::new(ScriptedRunner::default()),
        Arc::new(FakeClock::new(0)),
    );
    let roots = PollRoots {
        steam_root: steam.to_string_lossy().into_owned(),
        bottle_steamapps_root: Some(bottle.to_string_lossy().into_owned()),
        bridge_steamapps_root: None,
    };
    Rig {
        reg,
        host,
        outbox,
        roots,
        _tmp: tmp,
        bottle,
    }
}

fn args(r: &Rig, source: AcfSource) -> StartUninstallArgs {
    StartUninstallArgs {
        app_id: APP.into(),
        title: "Game".into(),
        roots: r.roots.clone(),
        source,
        interval_ms: None,
        bridge_authoritative: false,
    }
}

fn start(r: &Rig, source: AcfSource) -> Result<bool, String> {
    start_uninstall(&r.reg, r.outbox.clone(), args(r, source))
}

async fn settle() {
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
}

fn labels(host: &RecordingHost) -> Vec<String> {
    host.records()
        .iter()
        .map(|r| match r {
            StreamRecord::State(e) => format!("state:{}", e.kind()),
            StreamRecord::Frontend { channel, args } if channel == "gameStatusUpdate" => {
                format!("status:{}", args[0]["status"].as_str().unwrap_or(""))
            }
            StreamRecord::Frontend { channel, .. } => format!("fe:{channel}"),
            StreamRecord::Notify { .. } => "notify".into(),
            StreamRecord::File { op, .. } => format!("file:{op}"),
        })
        .collect()
}

#[tokio::test(start_paused = true)]
async fn start_twice_registers_one_poll_and_stop_is_idempotent() {
    let r = rig().await;
    assert_eq!(start(&r, AcfSource::Native), Ok(true));
    assert_eq!(start(&r, AcfSource::Native), Ok(false));
    assert!(r.reg.is_active(PollKind::Uninstall, APP));
    assert!(stop_uninstall(&r.reg, APP));
    tokio::time::sleep(Duration::from_millis(10)).await;
    settle().await;
    assert!(!r.reg.is_active(PollKind::Uninstall, APP));
    assert!(!stop_uninstall(&r.reg, APP));
    // A stopped poll can register again.
    assert_eq!(start(&r, AcfSource::Native), Ok(true));
    stop_uninstall(&r.reg, APP);
}

#[tokio::test(start_paused = true)]
async fn rejects_a_non_numeric_app_id() {
    let r = rig().await;
    let mut a = args(&r, AcfSource::Native);
    a.app_id = "../x".into();
    assert!(start_uninstall(&r.reg, r.outbox.clone(), a).is_err());
}

#[tokio::test(start_paused = true)]
async fn absent_manifest_completes_state_event_then_done_then_notify() {
    let r = rig().await;
    start(&r, AcfSource::Native).unwrap();
    tokio::time::sleep(Duration::from_millis(3100)).await;
    settle().await;
    assert_eq!(
        labels(&r.host),
        vec!["state:uninstalled", "status:done", "notify"]
    );
    assert!(!r.reg.is_active(PollKind::Uninstall, APP));
}

#[tokio::test(start_paused = true)]
async fn uninstalling_then_absent_over_ticks() {
    let r = rig().await;
    let steamapps = std::path::Path::new(&r.roots.steam_root).join("steamapps");
    write_app_manifest(&steamapps, &manifest("2052"), 1).unwrap();
    start(&r, AcfSource::Native).unwrap();
    tokio::time::sleep(Duration::from_millis(3100)).await;
    settle().await;
    assert_eq!(labels(&r.host), vec!["status:uninstalling"]);
    std::fs::remove_file(steamapps.join(format!("appmanifest_{APP}.acf"))).unwrap();
    tokio::time::sleep(Duration::from_millis(3000)).await;
    settle().await;
    assert_eq!(
        labels(&r.host),
        vec![
            "status:uninstalling",
            "state:uninstalled",
            "status:done",
            "notify"
        ]
    );
}

#[tokio::test(start_paused = true)]
async fn bottle_removed_with_native_survivor_reports_survivor_event() {
    let r = rig().await;
    let steamapps = std::path::Path::new(&r.roots.steam_root).join("steamapps");
    write_app_manifest(&steamapps, &manifest("4"), 1).unwrap();
    start(&r, AcfSource::Bottle).unwrap();
    tokio::time::sleep(Duration::from_millis(3100)).await;
    settle().await;
    assert_eq!(
        labels(&r.host),
        vec![
            "state:forcedWindowsViaBottleCleared",
            "state:uninstalled",
            "status:done",
            "notify"
        ]
    );
    let survivor = r.host.records().into_iter().find_map(|x| match x {
        StreamRecord::State(StateEvent::Uninstalled { survivor, .. }) => survivor,
        _ => None,
    });
    assert_eq!(survivor.map(|s| s.source), Some("native".to_string()));
    let _ = &r.bottle;
}

#[tokio::test(start_paused = true)]
async fn no_activity_window_gives_up_with_shared_notice_seq() {
    let r = rig().await;
    let steamapps = std::path::Path::new(&r.roots.steam_root).join("steamapps");
    write_app_manifest(&steamapps, &manifest("4"), 1).unwrap();
    // One notice seq already taken (an install give-up): the uninstall notice is the next.
    assert_eq!(r.reg.next_notice_seq(), 1);
    start(&r, AcfSource::Native).unwrap();
    tokio::time::sleep(Duration::from_millis(
        3000 * STEAM_REQUEST_NO_ACTIVITY_TICKS as u64 + 100,
    ))
    .await;
    settle().await;
    let notice = r.host.records().into_iter().find_map(|x| match x {
        StreamRecord::Frontend { channel, args } if channel == "steamRequestNotice" => {
            Some(args[0].clone())
        }
        _ => None,
    });
    assert_eq!(
        notice,
        Some(json!({"appId": APP, "title": "Game", "kind": "uninstall-not-started", "seq": 2}))
    );
    assert_eq!(
        labels(&r.host),
        vec!["status:done", "fe:steamRequestNotice"]
    );
    assert!(!r.reg.is_active(PollKind::Uninstall, APP));
}

#[tokio::test(start_paused = true)]
async fn active_uninstalling_disarms_the_loop_give_up() {
    let r = rig().await;
    let steamapps = std::path::Path::new(&r.roots.steam_root).join("steamapps");
    write_app_manifest(&steamapps, &manifest("2052"), 1).unwrap();
    start(&r, AcfSource::Native).unwrap();
    tokio::time::sleep(Duration::from_millis(
        3000 * (STEAM_REQUEST_NO_ACTIVITY_TICKS as u64 + 5),
    ))
    .await;
    settle().await;
    assert!(r.reg.is_active(PollKind::Uninstall, APP));
    assert!(!labels(&r.host).contains(&"fe:steamRequestNotice".to_string()));
    stop_uninstall(&r.reg, APP);
}
