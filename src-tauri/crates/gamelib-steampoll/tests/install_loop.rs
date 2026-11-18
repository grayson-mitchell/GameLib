//! Port of `library.installPolling.test.ts` plus the loop behaviours plan 15 adds (Mac arch
//! follow-up, InstallApp feedback, query surface). The mapping table is in 80-15-SUMMARY.md.
//!
//! Every test runs the real ACF readers over a temp steamapps root against `RecordingHost`
//! under paused time.

use gamelib_steamfiles::acf::{write_app_manifest, AppManifestParams};
use gamelib_steampoll::acf_state::{AcfSource, PollRoots};
use gamelib_steampoll::constants::{
    GRACE_TICKS, MANIFEST_GONE_TICKS, MAX_TICKS, STEAM_REQUEST_NO_ACTIVITY_TICKS,
};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::host::RunOutput;
use gamelib_steampoll::install_loop::{
    AwaitingUpdateOpt, InstallAppRetryOpt, InstallPolls, PollOptions, StartInstallArgs,
};
use gamelib_steampoll::monitor::DownloadMonitor;
use gamelib_steampoll::outbox::Outbox;
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::registry::{PollKind, Registry};
use gamelib_steampoll::testing::{AckMode, FakeClock, RecordingHost, ScriptedRunner, StreamRecord};
use gamelib_steampoll::uninstall::{start_uninstall, stop_uninstall, StartUninstallArgs};
use gamelib_steampoll::win_live::{CounterSample, CounterSource};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;

const APP: &str = "730";

struct Rig {
    polls: InstallPolls,
    reg: Registry,
    host: Arc<RecordingHost>,
    runner: Arc<ScriptedRunner>,
    roots: PollRoots,
    steamapps: std::path::PathBuf,
    bottle: std::path::PathBuf,
    _tmp: TempDir,
}

fn manifest(app: &str, flags: &str) -> AppManifestParams {
    AppManifestParams {
        app_id: app.into(),
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

async fn rig_with(platform: Platform, darwin_monitor: bool, ack: AckReply) -> Rig {
    rig_build(platform, darwin_monitor, None, ack).await
}

/// `win_source` injects the Windows live source's counter reader (steam.exe's write counter).
async fn rig_build(
    platform: Platform,
    darwin_monitor: bool,
    win_source: Option<Arc<CounterSource>>,
    ack: AckReply,
) -> Rig {
    let tmp = TempDir::new().unwrap();
    let steam = tmp.path().join("steam");
    let steamapps = steam.join("steamapps");
    std::fs::create_dir_all(&steamapps).unwrap();
    std::fs::write(
        steamapps.join("libraryfolders.vdf"),
        format!(
            "\"libraryfolders\"\n{{\n\"0\"\n{{\n\"path\" \"{}\"\n}}\n}}\n",
            steam.display()
        ),
    )
    .unwrap();
    let bottle = tmp.path().join("bottle");
    std::fs::create_dir_all(&bottle).unwrap();
    let host = Arc::new(RecordingHost::new(AckMode::Reply(ack)));
    let runner = Arc::new(ScriptedRunner::default());
    let clock = Arc::new(FakeClock::new(1_000_000));
    let outbox = Arc::new(Outbox::new());
    outbox.mark_ready(host.as_ref()).await;
    let reg = Registry::new(
        tokio::runtime::Handle::current(),
        host.clone(),
        runner.clone(),
        clock.clone(),
    );
    let mut monitor =
        DownloadMonitor::with_platform(host.clone(), runner.clone(), clock, darwin_monitor);
    if let Some(source) = win_source {
        monitor = monitor.with_windows_source(source);
    }
    let monitor = Arc::new(monitor);
    let polls = InstallPolls::new(reg.clone(), outbox, monitor, platform);
    let roots = PollRoots {
        steam_root: steam.to_string_lossy().into_owned(),
        bottle_steamapps_root: Some(bottle.to_string_lossy().into_owned()),
        bridge_steamapps_root: None,
    };
    Rig {
        polls,
        reg,
        host,
        runner,
        roots,
        steamapps,
        bottle,
        _tmp: tmp,
    }
}

async fn rig() -> Rig {
    rig_with(
        Platform::Linux,
        false,
        AckReply {
            applied: true,
            title: Some("Game".into()),
            ..AckReply::default()
        },
    )
    .await
}

fn args(r: &Rig, app: &str, options: PollOptions) -> StartInstallArgs {
    StartInstallArgs {
        app_id: app.into(),
        title: "Game".into(),
        roots: r.roots.clone(),
        options,
    }
}

fn start(r: &Rig, options: PollOptions) {
    r.polls.start_install(args(r, APP, options)).unwrap();
}

fn delegated() -> PollOptions {
    PollOptions {
        delegated_to_steam_client: Some(true),
        ..PollOptions::default()
    }
}

fn handoff(source: Option<AcfSource>) -> PollOptions {
    PollOptions {
        is_native_handoff: Some(true),
        source,
        ..PollOptions::default()
    }
}

async fn settle() {
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
}

/// Run `n` ticks (3 s each, plus 100 ms so the n-th tick has finished).
async fn ticks(n: u32) {
    tokio::time::sleep(Duration::from_millis(3000 * n as u64 + 100)).await;
    settle().await;
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
        })
        .collect()
}

fn active(r: &Rig, app: &str) -> bool {
    r.reg.is_active(PollKind::Install, app)
}

fn write(r: &Rig, flags: &str) {
    write_app_manifest(&r.steamapps, &manifest(APP, flags), 1).unwrap();
}

fn remove(r: &Rig) {
    std::fs::remove_file(r.steamapps.join(format!("appmanifest_{APP}.acf"))).unwrap();
}

// ---- idempotency and stop ---------------------------------------------------------------------

#[tokio::test(start_paused = true)]
async fn start_twice_registers_one_poll() {
    let r = rig().await;
    start(&r, PollOptions::default());
    start(&r, PollOptions::default());
    assert_eq!(r.polls.status().installs.len(), 1);
    assert!(active(&r, APP));
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn stop_clears_the_entry_so_a_new_start_registers_again() {
    let r = rig().await;
    start(&r, PollOptions::default());
    assert!(r.polls.stop_install(APP));
    ticks(1).await;
    assert!(!active(&r, APP));
    assert!(r.polls.status().installs.is_empty());
    assert!(!r.polls.stop_install(APP), "idempotent");
    start(&r, PollOptions::default());
    assert_eq!(r.polls.status().installs.len(), 1);
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn rejects_a_non_numeric_app_id() {
    let r = rig().await;
    assert!(r
        .polls
        .start_install(args(&r, "../x", PollOptions::default()))
        .is_err());
    assert!(r
        .polls
        .start_install(args(&r, "12345678901", PollOptions::default()))
        .is_err());
}

// ---- grace window (CR-01, dkf Tests A and B) -------------------------------------------------

#[tokio::test(start_paused = true)]
async fn cr01_done_after_the_grace_window_when_no_manifest_appears() {
    let r = rig().await;
    start(&r, PollOptions::default());
    ticks(GRACE_TICKS - 1).await;
    assert!(labels(&r.host).is_empty());
    ticks(1).await;
    assert_eq!(labels(&r.host), vec!["status:done"]);
    assert!(!active(&r, APP));
}

#[tokio::test(start_paused = true)]
async fn test_a_live_native_download_survives_the_grace_window() {
    let r = rig().await;
    r.polls.set_native_in_flight(APP, true);
    start(&r, PollOptions::default());
    ticks(GRACE_TICKS + 5).await;
    assert!(labels(&r.host).is_empty());
    assert!(active(&r, APP));
    // The mirror is read per tick: once the run ends, the next tick applies the grace rule.
    r.polls.set_native_in_flight(APP, false);
    ticks(1).await;
    assert_eq!(labels(&r.host), vec!["status:done"]);
    assert!(!active(&r, APP));
}

// ---- upgrade (dkf Tests C/D, g9o Tests E/F/G) ------------------------------------------------

#[tokio::test(start_paused = true)]
async fn test_c_handoff_start_upgrades_the_poll_and_keeps_one_task() {
    let r = rig().await;
    start(&r, PollOptions::default());
    assert!(
        !r.polls
            .snapshot_poll(APP)
            .unwrap()
            .handoff
            .is_native_handoff
    );
    start(
        &r,
        PollOptions {
            skipped_depots: Some(vec!["731".into()]),
            ..handoff(None)
        },
    );
    let p = r.polls.snapshot_poll(APP).unwrap();
    assert!(p.handoff.is_native_handoff);
    assert_eq!(p.handoff.skipped_depots, vec!["731".to_string()]);
    assert_eq!(r.polls.status().installs.len(), 1);
    // A second upgrade never discards a non-empty list.
    start(
        &r,
        PollOptions {
            skipped_depots: Some(vec!["999".into()]),
            ..handoff(None)
        },
    );
    assert_eq!(
        r.polls.snapshot_poll(APP).unwrap().handoff.skipped_depots,
        vec!["731".to_string()]
    );
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn test_d_a_bare_call_never_clears_the_handoff_flag() {
    let r = rig().await;
    start(&r, handoff(None));
    start(&r, PollOptions::default());
    assert!(
        r.polls
            .snapshot_poll(APP)
            .unwrap()
            .handoff
            .is_native_handoff
    );
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn test_e_bare_native_poll_upgraded_by_the_bottle_handoff_reaches_installed() {
    let r = rig().await;
    write_app_manifest(&r.bottle, &manifest(APP, "4"), 1).unwrap();
    r.polls.set_native_in_flight(APP, true);
    start(&r, PollOptions::default());
    // 2 ticks on the native root (no manifest there), then the finalize call retargets.
    ticks(2).await;
    let before = r.polls.snapshot_poll(APP).unwrap().ticks;
    start(&r, handoff(Some(AcfSource::Bottle)));
    let p = r.polls.snapshot_poll(APP).unwrap();
    assert_eq!(p.source, AcfSource::Bottle);
    assert_eq!(p.ticks, before, "ticks are kept: MAX_TICKS stays absolute");
    ticks(1).await;
    let recs = r.host.records();
    assert!(recs.iter().any(|x| matches!(
        x,
        StreamRecord::State(StateEvent::Installed { source, .. }) if source == "bottle"
    )));
    assert!(!active(&r, APP));
}

#[tokio::test(start_paused = true)]
async fn retarget_resets_the_per_root_baselines() {
    let r = rig().await;
    start(&r, PollOptions::default());
    {
        // Seed baselines through a real download tick.
        write(&r, "1026");
        ticks(2).await;
    }
    start(&r, handoff(Some(AcfSource::Bottle)));
    let p = r.polls.snapshot_poll(APP).unwrap();
    assert_eq!(p.last_bytes_downloaded, None);
    assert_eq!(p.last_tick_ms, None);
    assert_eq!(p.stalled_ticks, 0);
    assert_eq!(p.handoff.absent_ticks_since_seen, 0);
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn test_f_source_without_handoff_never_retargets() {
    let r = rig().await;
    start(&r, PollOptions::default());
    start(
        &r,
        PollOptions {
            source: Some(AcfSource::Bottle),
            ..PollOptions::default()
        },
    );
    let p = r.polls.snapshot_poll(APP).unwrap();
    assert_eq!(p.source, AcfSource::Native);
    assert!(!p.handoff.is_native_handoff);
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn test_g_handoff_without_source_never_resets_a_bottle_poll() {
    let r = rig().await;
    start(
        &r,
        PollOptions {
            source: Some(AcfSource::Bottle),
            ..PollOptions::default()
        },
    );
    start(&r, handoff(None));
    let p = r.polls.snapshot_poll(APP).unwrap();
    assert_eq!(p.source, AcfSource::Bottle);
    assert!(p.handoff.is_native_handoff);
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn bottle_source_polls_the_bottle_root_not_the_native_one() {
    let r = rig().await;
    write_app_manifest(&r.bottle, &manifest(APP, "4"), 1).unwrap();
    start(
        &r,
        PollOptions {
            source: Some(AcfSource::Bottle),
            ..PollOptions::default()
        },
    );
    ticks(1).await;
    assert_eq!(
        labels(&r.host),
        vec!["state:installed", "status:done", "notify"]
    );
}

// ---- installAppRetry carry-through (74-30) ---------------------------------------------------

fn awaiting(with_retry: bool) -> PollOptions {
    PollOptions {
        awaiting_update: Some(AwaitingUpdateOpt {
            from_build: "7".into(),
            target_build: Some("8".into()),
            install_app_retry: with_retry.then(|| InstallAppRetryOpt {
                library_path: Some("/lib".into()),
                attempts: 2,
            }),
        }),
        ..PollOptions::default()
    }
}

#[tokio::test(start_paused = true)]
async fn fresh_poll_keeps_install_app_retry_on_awaiting_update() {
    let r = rig().await;
    start(&r, awaiting(true));
    let a = r.polls.snapshot_poll(APP).unwrap().awaiting_update.unwrap();
    let retry = a.install_app_retry.unwrap();
    assert_eq!(retry.library_path.as_deref(), Some("/lib"));
    assert_eq!(retry.attempts, 2);
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn upgrade_keeps_install_app_retry_on_awaiting_update() {
    let r = rig().await;
    start(&r, PollOptions::default());
    start(&r, awaiting(true));
    let p = r.polls.snapshot_poll(APP).unwrap();
    assert_eq!(
        p.awaiting_update
            .unwrap()
            .install_app_retry
            .unwrap()
            .attempts,
        2
    );
    assert!(r.polls.status().installs[0].awaiting_update);
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn options_without_install_app_retry_leave_none() {
    let r = rig().await;
    start(&r, awaiting(false));
    assert!(r
        .polls
        .snapshot_poll(APP)
        .unwrap()
        .awaiting_update
        .unwrap()
        .install_app_retry
        .is_none());
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn the_install_app_outcome_feeds_back_into_the_next_update_tick() {
    // Retry armed, no Steam activity: the update tick asks for InstallApp on tick 3; the helper is
    // missing (RecordingHost has no helper path), so the outcome is Unavailable and the loop must
    // hand it to the next tick, which clears in_flight so the retry can run again on tick 6.
    let r = rig().await;
    write_app_manifest(&r.steamapps, &manifest(APP, "4"), 1).unwrap();
    start(&r, awaiting(true));
    ticks(3).await;
    let retry = r
        .polls
        .snapshot_poll(APP)
        .unwrap()
        .awaiting_update
        .unwrap()
        .install_app_retry
        .unwrap();
    assert!(
        retry.in_flight,
        "request made on tick 3, outcome not yet applied"
    );
    assert_eq!(retry.request_tick, 3);
    ticks(1).await;
    let retry = r
        .polls
        .snapshot_poll(APP)
        .unwrap()
        .awaiting_update
        .unwrap()
        .install_app_retry
        .unwrap();
    assert!(!retry.in_flight, "tick 4 applied the outcome");
    r.polls.stop_install(APP);
}

// ---- MAX_TICKS (74-27) -----------------------------------------------------------------------

#[tokio::test(start_paused = true)]
async fn an_install_poll_at_the_cap_stays_silent_and_stops_after_7200_ticks() {
    let r = rig().await;
    r.polls.set_native_in_flight(APP, true);
    start(&r, PollOptions::default());
    ticks(MAX_TICKS - 1).await;
    assert!(active(&r, APP));
    assert!(labels(&r.host).is_empty());
    ticks(1).await;
    assert!(!active(&r, APP));
    assert!(
        labels(&r.host).is_empty(),
        "the install cap sends no status"
    );
}

#[tokio::test(start_paused = true)]
async fn an_update_poll_sends_done_when_the_cap_stops_it() {
    let r = rig().await;
    // StateFlags 0x100 (running): activity is seen, so the update never ends quietly and the
    // poll runs to the cap.
    write(&r, "256");
    start(&r, awaiting(false));
    ticks(MAX_TICKS - 1).await;
    assert!(active(&r, APP));
    assert!(!labels(&r.host).contains(&"status:done".to_string()));
    ticks(1).await;
    assert!(!active(&r, APP));
    let l = labels(&r.host);
    assert_eq!(l.last().unwrap(), "status:done");
    assert_eq!(l.iter().filter(|x| *x == "status:done").count(), 1);
}

// ---- delegated polls (quick 261024-exo, 261105-vfq) ------------------------------------------

#[tokio::test(start_paused = true)]
async fn vfq2_a_delegated_poll_flags_managed_by_steam_at_registration() {
    let r = rig().await;
    start(&r, delegated());
    let recs = r.host.records();
    assert_eq!(recs.len(), 1);
    match &recs[0] {
        StreamRecord::Frontend { channel, args } => {
            assert_eq!(channel, "gameStatusUpdate");
            assert_eq!(args[0]["status"], "installing");
            assert_eq!(args[0]["managedBySteam"], true);
        }
        other => panic!("unexpected {other:?}"),
    }
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn d1_a_delegated_poll_survives_grace_then_stops_with_an_in_app_notice() {
    let r = rig().await;
    start(&r, delegated());
    ticks(STEAM_REQUEST_NO_ACTIVITY_TICKS - 1).await;
    assert_eq!(labels(&r.host), vec!["status:installing"]);
    assert!(active(&r, APP));
    ticks(1).await;
    assert_eq!(
        labels(&r.host),
        vec!["status:installing", "status:done", "fe:steamRequestNotice"]
    );
    let recs = r.host.records();
    let StreamRecord::Frontend { args, .. } = &recs[2] else {
        panic!()
    };
    assert_eq!(args[0]["kind"], "install-not-started");
    assert_eq!(args[0]["appId"], APP);
    assert_eq!(args[0]["title"], "Game");
    assert!(!labels(&r.host).contains(&"notify".to_string()));
    assert!(!active(&r, APP));
}

#[tokio::test(start_paused = true)]
async fn d2_stops_after_manifest_gone_ticks_but_not_after_one_absent_tick() {
    let r = rig().await;
    write(&r, "1042");
    start(&r, delegated());
    ticks(1).await;
    remove(&r);
    ticks(1).await;
    assert!(active(&r, APP), "a single absent tick does not stop it");
    write(&r, "1042");
    ticks(1).await;
    assert_eq!(
        r.polls
            .snapshot_poll(APP)
            .unwrap()
            .handoff
            .absent_ticks_since_seen,
        0
    );
    remove(&r);
    ticks(MANIFEST_GONE_TICKS - 1).await;
    assert!(active(&r, APP));
    ticks(1).await;
    assert!(!active(&r, APP));
    assert_eq!(labels(&r.host).last().unwrap(), "status:done");
}

#[tokio::test(start_paused = true)]
async fn d3_absent_then_downloading_then_installed_stops_via_the_installed_branch() {
    let r = rig().await;
    start(&r, delegated());
    ticks(2).await;
    write(&r, "1042");
    ticks(1).await;
    write(&r, "4");
    ticks(1).await;
    let l = labels(&r.host);
    assert!(l.contains(&"state:installed".to_string()), "{l:?}");
    assert!(!l.contains(&"fe:steamRequestNotice".to_string()));
    assert!(!active(&r, APP));
}

#[tokio::test(start_paused = true)]
async fn vfq1_a_manifest_that_stays_downloading_disarms_the_no_activity_timeout() {
    let r = rig().await;
    write(&r, "1042");
    start(&r, delegated());
    ticks(STEAM_REQUEST_NO_ACTIVITY_TICKS + 10).await;
    assert!(active(&r, APP));
    assert!(!labels(&r.host).contains(&"fe:steamRequestNotice".to_string()));
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn vfq3_upgrading_a_bare_poll_to_delegated_counts_the_window_from_the_upgrade() {
    let r = rig().await;
    r.polls.set_native_in_flight(APP, true);
    start(&r, PollOptions::default());
    ticks(30).await;
    start(&r, delegated());
    assert_eq!(r.polls.snapshot_poll(APP).unwrap().delegated_since_tick, 30);
    assert_eq!(labels(&r.host), vec!["status:installing"]);
    ticks(STEAM_REQUEST_NO_ACTIVITY_TICKS - 1).await;
    assert!(active(&r, APP));
    ticks(1).await;
    assert!(!active(&r, APP));
    assert!(labels(&r.host).contains(&"fe:steamRequestNotice".to_string()));
}

#[tokio::test(start_paused = true)]
async fn vfq4_cancel_delegated_stops_a_delegated_poll_with_one_done_and_false_otherwise() {
    let r = rig().await;
    assert!(!r.polls.cancel_delegated(APP));
    start(&r, PollOptions::default());
    assert!(!r.polls.cancel_delegated(APP), "not delegated");
    assert!(active(&r, APP));
    r.polls.stop_install(APP);
    ticks(1).await;
    start(&r, delegated());
    assert!(r.polls.cancel_delegated(APP));
    let done = labels(&r.host)
        .iter()
        .filter(|l| *l == "status:done")
        .count();
    assert_eq!(done, 1);
    ticks(1).await;
    assert!(!active(&r, APP));
    assert!(!r.polls.cancel_delegated(APP));
}

#[tokio::test(start_paused = true)]
async fn pvk3_two_give_ups_carry_strictly_increasing_seq() {
    let r = rig().await;
    r.polls.start_install(args(&r, "100", delegated())).unwrap();
    r.polls.start_install(args(&r, "200", delegated())).unwrap();
    ticks(STEAM_REQUEST_NO_ACTIVITY_TICKS).await;
    let seqs: Vec<u64> = r
        .host
        .records()
        .iter()
        .filter_map(|x| match x {
            StreamRecord::Frontend { channel, args } if channel == "steamRequestNotice" => {
                args[0]["seq"].as_u64()
            }
            _ => None,
        })
        .collect();
    assert_eq!(seqs.len(), 2);
    assert!(seqs[1] > seqs[0]);
}

#[tokio::test(start_paused = true)]
async fn pvk4_status_reports_delegated_only_for_a_live_delegated_poll() {
    let r = rig().await;
    r.polls.start_install(args(&r, "100", delegated())).unwrap();
    r.polls
        .start_install(args(&r, "200", PollOptions::default()))
        .unwrap();
    let st = r.polls.status();
    assert_eq!(st.installs.len(), 2);
    assert!(st.installs[0].delegated_to_steam_client);
    assert!(!st.installs[1].delegated_to_steam_client);
    r.polls.stop_install("100");
    assert!(!r.polls.status().installs.iter().any(|i| i.app_id == "100"));
    r.polls.stop_install("200");
}

#[tokio::test(start_paused = true)]
async fn d4_d5_only_a_delegated_download_flags_managed_by_steam() {
    let r = rig().await;
    write(&r, "1042");
    start(&r, delegated());
    ticks(1).await;
    let flagged = |host: &RecordingHost| {
        host.records()
            .iter()
            .filter(|x| {
                matches!(x, StreamRecord::Frontend { channel, args }
                    if channel == "gameStatusUpdate"
                        && args[0]["status"] == "installing"
                        && args[0]["managedBySteam"] == true)
            })
            .count()
    };
    assert_eq!(flagged(&r.host), 2, "registration plus the tick");
    r.polls.stop_install(APP);

    let r2 = rig().await;
    write(&r2, "1042");
    start(&r2, PollOptions::default());
    ticks(1).await;
    assert_eq!(flagged(&r2.host), 0);
    r2.polls.stop_install(APP);
}

// ---- stop, completion ------------------------------------------------------------------

#[tokio::test(start_paused = true)]
async fn installed_ack_then_done_and_the_poll_ends() {
    let r = rig().await;
    write(&r, "4");
    start(&r, PollOptions::default());
    ticks(1).await;
    assert_eq!(
        labels(&r.host),
        vec!["state:installed", "status:done", "notify"]
    );
    assert!(!active(&r, APP));
    assert!(r.polls.status().installs.is_empty());
}

#[tokio::test(start_paused = true)]
async fn bridge_finalized_mirror_decides_finishing_versus_silent() {
    for finalized in [false, true] {
        let r = rig().await;
        r.polls.set_bridge_finalized(APP, finalized);
        let mut r_roots = r.roots.clone();
        r_roots.bridge_steamapps_root = Some(r.bottle.to_string_lossy().into_owned());
        write_app_manifest(&r.bottle, &manifest(APP, "4"), 1).unwrap();
        r.polls
            .start_install(StartInstallArgs {
                app_id: APP.into(),
                title: "Game".into(),
                roots: r_roots,
                options: PollOptions {
                    source: Some(AcfSource::Bridge),
                    ..PollOptions::default()
                },
            })
            .unwrap();
        ticks(1).await;
        let l = labels(&r.host);
        if finalized {
            assert_eq!(l, vec!["state:installed"]);
        } else {
            assert_eq!(l, vec!["state:installed", "status:installing"]);
        }
    }
}

/// 80-REVIEW C-WR-05: the installer finalizes while the `installed` ack is still out. The tick
/// observed the marker unset, but the status decision is made after the ack, so no finishing
/// status follows the installer's own `done`.
#[tokio::test(start_paused = true)]
async fn bridge_finalized_during_the_ack_sends_no_finishing_status() {
    use gamelib_steampoll::testing::AckMode;
    let r = rig().await;
    r.host.set_ack(AckMode::Never);
    r.polls.set_bridge_finalized(APP, false);
    let mut r_roots = r.roots.clone();
    r_roots.bridge_steamapps_root = Some(r.bottle.to_string_lossy().into_owned());
    write_app_manifest(&r.bottle, &manifest(APP, "4"), 1).unwrap();
    r.polls
        .start_install(StartInstallArgs {
            app_id: APP.into(),
            title: "Game".into(),
            roots: r_roots,
            options: PollOptions {
                source: Some(AcfSource::Bridge),
                ..PollOptions::default()
            },
        })
        .unwrap();
    // The first tick (3 s) observes the manifest and sends `installed`; its ack never comes.
    tokio::time::sleep(Duration::from_millis(4000)).await;
    settle().await;
    assert_eq!(labels(&r.host), vec!["state:installed"]);
    r.polls.set_bridge_finalized(APP, true);
    // Past the 5 s ack timeout: the continuation runs now.
    tokio::time::sleep(Duration::from_millis(6000)).await;
    settle().await;
    assert_eq!(labels(&r.host), vec!["state:installed"]);
}

// ---- Mac arch follow-up (R6) -----------------------------------------------------------------

#[tokio::test(start_paused = true)]
async fn the_mac_arch_probe_runs_off_tick_only_when_the_ack_asks_for_it() {
    for ask in [false, true] {
        let r = rig_with(
            Platform::Darwin,
            false,
            AckReply {
                applied: true,
                title: Some("Game".into()),
                mac_arch_check: Some(ask),
                ..AckReply::default()
            },
        )
        .await;
        let bin_dir = r.steamapps.join("common/Game/Game.app/Contents/MacOS");
        std::fs::create_dir_all(&bin_dir).unwrap();
        std::fs::write(bin_dir.join("Game"), b"x").unwrap();
        let bin = gamelib_steampoll::mac_arch::locate_macho_binary(
            &r.steamapps.join("common").join("Game"),
        )
        .expect("binary");
        r.runner.on(
            &format!("lipo -archs {}", bin.to_string_lossy()),
            vec![RunOutput {
                code: Some(0),
                stdout: "i386\n".into(),
                stderr: String::new(),
            }],
        );
        write(&r, "4");
        start(&r, PollOptions::default());
        ticks(1).await;
        let verdicts = r
            .host
            .records()
            .iter()
            .filter(|x| matches!(x, StreamRecord::State(StateEvent::MacArchVerdict { verdict, .. }) if verdict == "32"))
            .count();
        assert_eq!(verdicts, usize::from(ask), "ask={ask}");
    }
}

// ---- monitor lifecycle (quick 261029-sex) ----------------------------------------------------

#[tokio::test(start_paused = true)]
async fn the_monitor_starts_only_for_native_non_handoff_polls_on_macos() {
    let pgrep = "/usr/bin/pgrep -x steam_osx";
    let none = AckReply::default();

    let r = rig_with(Platform::Darwin, true, none.clone()).await;
    start(&r, PollOptions::default());
    settle().await;
    assert!(r.runner.calls().iter().any(|c| c == pgrep));
    r.polls.stop_install(APP);

    // Handoff and bottle polls never spawn a nettop child.
    let r = rig_with(Platform::Darwin, true, none.clone()).await;
    start(&r, handoff(None));
    settle().await;
    assert!(!r.runner.calls().iter().any(|c| c == pgrep));
    r.polls.stop_install(APP);

    let r = rig_with(Platform::Darwin, true, none.clone()).await;
    start(
        &r,
        PollOptions {
            source: Some(AcfSource::Bottle),
            ..PollOptions::default()
        },
    );
    settle().await;
    assert!(!r.runner.calls().iter().any(|c| c == pgrep));
    r.polls.stop_install(APP);

    // Never off macOS.
    let r = rig_with(Platform::Linux, true, none.clone()).await;
    start(&r, PollOptions::default());
    settle().await;
    assert!(!r.runner.calls().iter().any(|c| c == pgrep));
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn upgrading_a_poll_to_delegated_or_handoff_reevaluates_the_monitor() {
    let pgrep = "/usr/bin/pgrep -x steam_osx";
    let r = rig_with(Platform::Darwin, true, AckReply::default()).await;
    start(&r, handoff(None));
    settle().await;
    assert!(!r.runner.calls().iter().any(|c| c == pgrep));
    // Retargeting to a non-handoff delegated native poll is not possible (the flag never goes
    // back), so a handoff poll stays ineligible after a delegated upgrade.
    start(&r, delegated());
    settle().await;
    assert!(!r.runner.calls().iter().any(|c| c == pgrep));
    r.polls.stop_install(APP);
}

/// 80-REVIEW A/WR-09: a monitor that is not live (Steam was not running, or its child died in a
/// Steam restart) is retried every 5 ticks while the poll stays eligible, never every tick.
#[tokio::test(start_paused = true)]
async fn an_eligible_poll_retries_a_dead_monitor_every_five_ticks() {
    let pgrep = "/usr/bin/pgrep -x steam_osx";
    let r = rig_with(Platform::Darwin, true, AckReply::default()).await;
    // Keep the poll alive past the grace window with a live download in flight.
    r.polls.set_native_in_flight(APP, true);
    r.runner.on(
        pgrep,
        vec![RunOutput {
            code: Some(1),
            ..RunOutput::default()
        }],
    );
    start(&r, PollOptions::default());
    settle().await;
    let count = |r: &Rig| r.runner.calls().iter().filter(|c| *c == pgrep).count();
    assert_eq!(count(&r), 1, "the start-time attempt");
    ticks(4).await;
    assert_eq!(count(&r), 1, "no retry before the fifth tick");
    ticks(1).await;
    assert_eq!(count(&r), 2, "one retry on the fifth tick");
    ticks(5).await;
    assert_eq!(count(&r), 3);
    r.polls.stop_install(APP);
}

// ---- Windows live source (debug win-steam-handoff-progress-zero) -----------------------------
//
// Windows Steam writes the ACF byte fields at setup and at the commit only; the loop reads
// steam.exe's write counter instead, through the injected source, while the ACF is downloading.

const WIN_TO_DOWNLOAD: u64 = 3_184_165_888;
const WIN_TO_STAGE: u64 = 3_335_661_215;

/// An injected steam.exe: `written` is how many bytes it has written since the test began, and
/// `calls` counts the reads the loop made.
struct Counter {
    written: Arc<AtomicU64>,
    calls: Arc<AtomicUsize>,
}

impl Counter {
    fn new() -> (Arc<CounterSource>, Counter) {
        let written = Arc::new(AtomicU64::new(0));
        let calls = Arc::new(AtomicUsize::new(0));
        let (w, c) = (written.clone(), calls.clone());
        let source: Arc<CounterSource> = Arc::new(move || {
            c.fetch_add(1, Ordering::SeqCst);
            Some(CounterSample {
                pid: 4242,
                write_bytes: 1_317_771_317 + w.load(Ordering::SeqCst),
            })
        });
        (source, Counter { written, calls })
    }

    fn set(&self, written: u64) {
        self.written.store(written, Ordering::SeqCst);
    }

    fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

/// The Windows ACF mid-download: 1026, both totals set, nothing downloaded or staged.
fn write_win_downloading(r: &Rig) {
    write_win_downloading_in(&r.steamapps);
}

fn write_win_downloading_in(dir: &std::path::Path) {
    let text = format!(
        "\"AppState\"\n{{\n\t\"appid\"\t\t\"{APP}\"\n\t\"StateFlags\"\t\t\"1026\"\n\t\"installdir\"\t\t\"Game\"\n\t\"name\"\t\t\"Game\"\n\t\"SizeOnDisk\"\t\t\"0\"\n\t\"buildid\"\t\t\"7\"\n\t\"BytesToDownload\"\t\t\"{WIN_TO_DOWNLOAD}\"\n\t\"BytesDownloaded\"\t\t\"0\"\n\t\"BytesToStage\"\t\t\"{WIN_TO_STAGE}\"\n\t\"BytesStaged\"\t\t\"0\"\n}}\n"
    );
    std::fs::write(dir.join(format!("appmanifest_{APP}.acf")), text).unwrap();
}

/// An update's own sizes: the changed content Steam stages is far smaller than the installed size
/// (`SizeOnDisk`), and the compressed download smaller again.
const WIN_UPDATE_TO_DOWNLOAD: u64 = 120_000_000;
const WIN_UPDATE_TO_STAGE: u64 = 400_000_000;

/// The Windows update ACF: an installed game (bit 4) with an update in progress. `flags` carries
/// the update bits ("6" pending, "1030" started), `buildid` the installed build; TargetBuildID is 8.
fn write_win_update_in(dir: &std::path::Path, flags: &str, buildid: &str) {
    let text = format!(
        "\"AppState\"
{{
	\"appid\"		\"{APP}\"
	\"StateFlags\"		\"{flags}\"
	\"installdir\"		\"Game\"
	\"name\"		\"Game\"
	\"SizeOnDisk\"		\"3335661215\"
	\"buildid\"		\"{buildid}\"
	\"TargetBuildID\"		\"8\"
	\"BytesToDownload\"		\"{WIN_UPDATE_TO_DOWNLOAD}\"
	\"BytesDownloaded\"		\"0\"
	\"BytesToStage\"		\"{WIN_UPDATE_TO_STAGE}\"
	\"BytesStaged\"		\"0\"
}}
"
    );
    std::fs::write(dir.join(format!("appmanifest_{APP}.acf")), text).unwrap();
}

fn percents(host: &RecordingHost) -> Vec<i64> {
    host.records()
        .iter()
        .filter_map(|rec| match rec {
            StreamRecord::Frontend { channel, args } if channel == "progressUpdate" => {
                args[0]["progress"]["percent"].as_i64()
            }
            _ => None,
        })
        .collect()
}

#[tokio::test(start_paused = true)]
async fn a_windows_delegated_poll_climbs_with_the_write_counter_then_flips_to_installed() {
    let (source, counter) = Counter::new();
    let r = rig_build(Platform::Win32, false, Some(source), AckReply::default()).await;
    write_win_downloading(&r);
    start(&r, delegated());
    ticks(1).await;
    assert_eq!(
        percents(&r.host),
        vec![0],
        "the first tick takes the baseline"
    );

    counter.set(WIN_TO_STAGE / 4);
    ticks(1).await;
    counter.set(WIN_TO_STAGE / 2);
    ticks(1).await;
    counter.set(WIN_TO_STAGE * 3);
    ticks(1).await;
    assert_eq!(percents(&r.host), vec![0, 25, 50, 99]);

    // Steam commits: StateFlags 4 ends the poll with the installed badge.
    write(&r, "4");
    ticks(1).await;
    assert!(!active(&r, APP));
    assert!(labels(&r.host).iter().any(|l| l == "state:installed"));
    assert_eq!(percents(&r.host).len(), 4, "no progress after the commit");
}

#[tokio::test(start_paused = true)]
async fn a_windows_update_poll_climbs_with_the_write_counter_then_completes() {
    let (source, counter) = Counter::new();
    let r = rig_build(Platform::Win32, false, Some(source), AckReply::default()).await;
    // FullyInstalled | UpdateRequired | UpdateStarted: the ACF byte fields stay frozen.
    write_win_update_in(&r.steamapps, "1030", "7");
    start(
        &r,
        PollOptions {
            delegated_to_steam_client: Some(true),
            ..awaiting(false)
        },
    );
    ticks(1).await;
    counter.set(WIN_UPDATE_TO_STAGE / 4);
    ticks(1).await;
    counter.set(WIN_UPDATE_TO_STAGE / 2);
    ticks(1).await;
    counter.set(WIN_UPDATE_TO_STAGE * 3);
    ticks(1).await;
    assert_eq!(percents(&r.host), vec![0, 25, 50, 99]);

    // Steam commits the update: the build changes and the poll completes.
    write_win_update_in(&r.steamapps, "4", "8");
    ticks(1).await;
    assert!(!active(&r, APP));
    assert_eq!(percents(&r.host).len(), 4, "no progress after the commit");
}

#[tokio::test(start_paused = true)]
async fn the_windows_baseline_is_the_first_downloading_tick_not_the_poll_start() {
    let (source, counter) = Counter::new();
    let r = rig_build(Platform::Win32, false, Some(source), AckReply::default()).await;
    // Delegated, but Steam has not written the ACF yet: no reading, and no counter read at all.
    r.polls.set_native_in_flight(APP, true);
    start(&r, delegated());
    ticks(2).await;
    assert_eq!(counter.calls(), 0);
    assert!(percents(&r.host).is_empty());

    // Steam wrote 700 MB of other things meanwhile; the download starts counting from here.
    counter.set(700_000_000);
    write_win_downloading(&r);
    ticks(1).await;
    assert_eq!(percents(&r.host), vec![0]);
    counter.set(700_000_000 + WIN_TO_STAGE / 2);
    ticks(1).await;
    assert_eq!(percents(&r.host), vec![0, 50]);
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn the_windows_baseline_survives_a_repeat_start_of_the_same_delegated_poll() {
    let (source, counter) = Counter::new();
    let r = rig_build(Platform::Win32, false, Some(source), AckReply::default()).await;
    write_win_downloading(&r);
    start(&r, delegated());
    ticks(1).await;
    counter.set(WIN_TO_STAGE / 2);
    ticks(1).await;
    // The sidecar starts the same poll again (an idempotent upgrade): the percent must not restart.
    start(&r, delegated());
    ticks(1).await;
    assert_eq!(percents(&r.host), vec![0, 50, 50]);
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn only_a_windows_delegated_native_install_poll_reads_the_counter() {
    // Not delegated (GameLib's own depot download), a depot handoff, a bottle poll, and every
    // other platform: the counter is never read. (A delegated Win32 update poll reads it once the
    // update runs; see `only_a_windows_delegated_native_update_poll_reads_the_counter`.)
    let cases: Vec<(&str, Platform, PollOptions)> = vec![
        ("not delegated", Platform::Win32, PollOptions::default()),
        (
            "depot handoff",
            Platform::Win32,
            PollOptions {
                delegated_to_steam_client: Some(true),
                ..handoff(None)
            },
        ),
        (
            "bottle source",
            Platform::Win32,
            PollOptions {
                delegated_to_steam_client: Some(true),
                source: Some(AcfSource::Bottle),
                ..PollOptions::default()
            },
        ),
        ("linux", Platform::Linux, delegated()),
        ("macos", Platform::Darwin, delegated()),
    ];
    for (name, platform, options) in cases {
        let (source, counter) = Counter::new();
        let r = rig_build(platform, false, Some(source), AckReply::default()).await;
        // Downloading ACFs on both roots, so each poll source has one to read.
        write_win_downloading(&r);
        write_win_downloading_in(&r.bottle);
        r.polls.set_native_in_flight(APP, true);
        start(&r, options);
        ticks(3).await;
        assert_eq!(counter.calls(), 0, "{name}: the counter must not be read");
        r.polls.stop_install(APP);
    }
}

// ---- concurrent uninstall starts (80-REVIEW A/WR-06) -----------------------------------------

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn concurrent_uninstall_starts_spawn_exactly_one_poll() {
    let r = rig().await;
    write(&r, "2052");
    for round in 0..20 {
        let barrier = Arc::new(std::sync::Barrier::new(8));
        let threads: Vec<_> = (0..8)
            .map(|_| {
                let reg = r.reg.clone();
                let roots = r.roots.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    start_uninstall(
                        &reg,
                        Arc::new(Outbox::new()),
                        StartUninstallArgs {
                            app_id: APP.into(),
                            title: "Game".into(),
                            roots,
                            source: AcfSource::Native,
                            interval_ms: None,
                            bridge_authoritative: false,
                        },
                    )
                    .unwrap()
                })
            })
            .collect();
        let started = threads
            .into_iter()
            .map(|t| t.join().unwrap())
            .filter(|s| *s)
            .count();
        assert_eq!(
            started, 1,
            "round {round}: {started} uninstall polls started"
        );
        // The one registered poll is reachable, so stop really stops it.
        assert!(stop_uninstall(&r.reg, APP));
        for _ in 0..200 {
            if !r.reg.is_active(PollKind::Uninstall, APP) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert!(!r.reg.is_active(PollKind::Uninstall, APP));
    }
}

// ---- TS-pushed mirrors and the removed hold options -----------------------------------------

#[test]
fn the_removed_hold_options_fail_deserialisation() {
    // Phase 81 D-11 / T-81-41: no hold field on the start contract; deny_unknown_fields rejects
    // each of the three that used to carry hold state.
    for (key, value) in [
        ("macNativeRoute", serde_json::json!(true)),
        ("adoptedBySteamClient", serde_json::json!(true)),
        (
            "restoredSteamHold",
            serde_json::json!({ "pids": [4242], "startTicks": 7 }),
        ),
    ] {
        let parsed: Result<PollOptions, _> =
            serde_json::from_value(serde_json::json!({ key: value }));
        assert!(parsed.is_err(), "{key} must no longer deserialize");
    }
}

#[tokio::test(start_paused = true)]
async fn status_wire_shape_carries_no_hold_for_any_install() {
    let r = rig().await;
    start(&r, handoff(None));
    let wire = serde_json::to_value(r.polls.status()).unwrap();
    // D-11: exactly {installs, uninstalls}, and each install exactly the three fields.
    assert_eq!(
        wire,
        serde_json::json!({
            "installs": [{
                "appId": APP,
                "delegatedToSteamClient": false,
                "awaitingUpdate": false
            }],
            "uninstalls": []
        })
    );
    r.polls.stop_install(APP);
}

#[tokio::test(start_paused = true)]
async fn status_lists_uninstall_polls_too() {
    let r = rig().await;
    let outbox = Arc::new(Outbox::new());
    write(&r, "2052");
    start_uninstall(
        &r.reg,
        outbox,
        StartUninstallArgs {
            app_id: APP.into(),
            title: "Game".into(),
            roots: r.roots.clone(),
            source: AcfSource::Native,
            interval_ms: None,
            bridge_authoritative: false,
        },
    )
    .unwrap();
    assert_eq!(r.polls.status().uninstalls, vec![APP.to_string()]);
    stop_uninstall(&r.reg, APP);
}
