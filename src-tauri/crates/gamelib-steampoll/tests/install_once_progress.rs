//! Port of the absent / downloading / progress cases of `library.installPollOnce.test.ts`.
//! The mapping table (all 57 cases) is in 80-14-SUMMARY.md.

use gamelib_steampoll::acf_state::{AcfSource, AcfState, PollRoots};
use gamelib_steampoll::constants::{MANIFEST_GONE_TICKS, STALLED_TICKS_THRESHOLD};
use gamelib_steampoll::effects::{Continuation, Effect, LogLevel};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::host::NotifyText;
use gamelib_steampoll::install_once::{
    install_step, restart_to_finish_notification, windows_live_applies, ActiveInstall,
    InstallObservation,
};
use gamelib_steampoll::monitor::DownloadReading;
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::win_live::reading_from_write_delta;
use serde_json::Value;

const APP: &str = "730";

fn roots() -> PollRoots {
    PollRoots {
        steam_root: "/steam".into(),
        bottle_steamapps_root: Some("/bottle/steamapps".into()),
        bridge_steamapps_root: Some("/bridge/steamapps".into()),
    }
}

fn poll(source: AcfSource) -> ActiveInstall {
    ActiveInstall::new("CS:GO", roots(), source)
}

fn handoff(source: AcfSource) -> ActiveInstall {
    let mut p = poll(source);
    p.handoff.is_native_handoff = true;
    p
}

fn dl(flags: u32, done: u64, total: u64, staged: u64, to_stage: u64) -> AcfState {
    AcfState::Downloading {
        state_flags: Some(flags),
        bytes_downloaded: done,
        bytes_to_download: total,
        bytes_staged: staged,
        bytes_to_stage: to_stage,
    }
}

fn obs(acf: AcfState, now_ms: u64) -> InstallObservation {
    InstallObservation {
        acf,
        update_fields: None,
        monitor: None,
        now_ms,
        platform: Platform::Linux,
        bridge_finalized: false,
        install_app_outcome: None,
        seq: 1,
    }
}

fn frontend<'a>(effects: &'a [Effect], channel: &str) -> Vec<&'a Value> {
    effects
        .iter()
        .filter_map(|e| match e {
            Effect::Frontend { channel: c, args } if c == channel => Some(&args[0]),
            _ => None,
        })
        .collect()
}

fn statuses(effects: &[Effect]) -> Vec<&Value> {
    frontend(effects, "gameStatusUpdate")
}

fn progress(effects: &[Effect]) -> Vec<&Value> {
    frontend(effects, "progressUpdate")
}

fn notifies(effects: &[Effect]) -> usize {
    effects
        .iter()
        .filter(|e| matches!(e, Effect::Notify(_)))
        .count()
}

fn restart_notifies(effects: &[Effect]) -> usize {
    effects
        .iter()
        .filter(|e| match e {
            Effect::Notify(n) => matches!(&n.body, NotifyText::Key { key, .. } if key == "steam.waitingForSteam.notify"),
            _ => false,
        })
        .count()
}

/// One tick; returns the effects.
fn tick(p: &mut ActiveInstall, acf: AcfState, now_ms: u64) -> Vec<Effect> {
    p.ticks += 1;
    install_step(APP, p, &obs(acf, now_ms)).effects
}

// ---- plain downloading -----------------------------------------------------------------------

#[test]
fn sends_installing_when_downloading() {
    let mut p = poll(AcfSource::Native);
    let fx = tick(&mut p, dl(2, 0, 0, 0, 0), 0);
    let s = statuses(&fx);
    assert_eq!(s.len(), 1);
    assert_eq!(s[0]["status"], "installing");
    assert_eq!(s[0]["appName"], APP);
    assert_eq!(s[0]["runner"], "steam");
    assert!(s[0].get("context").is_none());
    assert_eq!(notifies(&fx), 0, "no toast on an interim tick");
    assert!(p.handoff.seen_downloading);
}

#[test]
fn progress_percent_50_for_mid_download() {
    let mut p = poll(AcfSource::Native);
    let fx = tick(&mut p, dl(2, 5, 10, 0, 0), 0);
    let pr = progress(&fx);
    assert_eq!(pr.len(), 1);
    assert_eq!(pr[0]["progress"]["percent"], 50);
    assert_eq!(pr[0]["status"], "installing");
}

#[test]
fn staged_fallback_when_bytes_to_download_is_zero() {
    let mut p = poll(AcfSource::Native);
    let fx = tick(&mut p, dl(2, 0, 0, 3, 6), 0);
    assert_eq!(progress(&fx)[0]["progress"]["percent"], 50);
}

#[test]
fn no_progress_when_both_totals_are_zero() {
    let mut p = poll(AcfSource::Native);
    let fx = tick(&mut p, dl(2, 0, 0, 0, 0), 0);
    assert!(progress(&fx).is_empty());
    // the status still fires
    assert_eq!(statuses(&fx).len(), 1);
}

#[test]
fn first_tick_has_no_down_speed_and_empty_eta() {
    let mut p = poll(AcfSource::Native);
    let fx = tick(&mut p, dl(2, 5, 10, 0, 0), 0);
    let pr = progress(&fx);
    assert_eq!(pr[0]["progress"]["percent"], 50);
    assert!(pr[0]["progress"].get("downSpeed").is_none());
    assert_eq!(pr[0]["progress"]["eta"], "");
}

#[test]
fn rising_download_second_tick_has_speed_and_eta() {
    let mut p = poll(AcfSource::Native);
    let first = tick(&mut p, dl(2, 5_000_000, 10_000_000, 0, 0), 0);
    assert!(progress(&first)[0]["progress"].get("downSpeed").is_none());
    let second = tick(&mut p, dl(2, 8_000_000, 10_000_000, 0, 0), 3000);
    let pr = &progress(&second)[0]["progress"];
    assert_eq!(pr["percent"], 80);
    let speed = pr["downSpeed"].as_f64().unwrap();
    assert!(speed > 0.0 && speed.is_finite());
    // 3,000,000 B over 3 s
    assert!((speed - 1_000_000.0 / (1024.0 * 1024.0)).abs() < 1e-9);
    assert_eq!(pr["eta"], "00:00:02");
}

#[test]
fn back_to_back_ticks_never_emit_a_non_finite_speed() {
    let mut p = poll(AcfSource::Native);
    tick(&mut p, dl(2, 0, 10_000_000, 0, 0), 5000);
    let fx = tick(&mut p, dl(2, 9_000_000, 10_000_000, 0, 0), 5000);
    for payload in progress(&fx) {
        let pr = &payload["progress"];
        if let Some(s) = pr.get("downSpeed") {
            let s = s.as_f64().unwrap();
            assert!(s.is_finite() && s >= 0.0);
        }
        assert!(pr["eta"].is_string());
        assert!(pr["percent"].is_number());
    }
}

#[test]
fn staged_fallback_has_no_speed_or_eta() {
    let mut p = poll(AcfSource::Native);
    tick(&mut p, dl(2, 0, 0, 3, 6), 0);
    let fx = tick(&mut p, dl(2, 0, 0, 3, 6), 3000);
    for payload in progress(&fx) {
        let pr = &payload["progress"];
        assert_eq!(pr["percent"], 50);
        assert!(pr.get("downSpeed").is_none());
        assert_eq!(pr["eta"], "");
    }
}

// ---- stall detection -------------------------------------------------------------------------

#[test]
fn paused_after_stalled_ticks_threshold_on_a_real_in_flight_download() {
    let mut p = poll(AcfSource::Native);
    let mut last = vec![];
    // the first tick has no baseline, so threshold + 1 ticks reach the threshold of frozen ones
    for i in 0..=STALLED_TICKS_THRESHOLD {
        last = tick(&mut p, dl(2, 5_000_000, 10_000_000, 0, 0), i as u64 * 3000);
    }
    assert_eq!(statuses(&last).last().unwrap()["context"], "steam-paused");
}

#[test]
fn not_paused_one_tick_before_the_threshold() {
    let mut p = poll(AcfSource::Native);
    for i in 0..STALLED_TICKS_THRESHOLD {
        let fx = tick(&mut p, dl(2, 5_000_000, 10_000_000, 0, 0), i as u64 * 3000);
        assert!(statuses(&fx)[0].get("context").is_none());
    }
}

#[test]
fn never_paused_while_bytes_keep_rising() {
    let mut p = poll(AcfSource::Native);
    for i in 1..=4u64 {
        let fx = tick(&mut p, dl(2, i * 1_000_000, 10_000_000, 0, 0), i * 3000);
        for s in statuses(&fx) {
            assert_ne!(s["context"], "steam-paused");
        }
    }
    assert_eq!(p.stalled_ticks, 0);
}

#[test]
fn frozen_1026_native_handoff_keeps_waiting_never_paused() {
    let mut p = handoff(AcfSource::Native);
    for i in 0..4u64 {
        let fx = tick(&mut p, dl(1026, 5_000_000, 10_000_000, 0, 0), i * 3000);
        for s in statuses(&fx) {
            assert_eq!(s["context"], "steam-waiting-for-restart");
        }
    }
}

#[test]
fn staged_fallback_frozen_is_never_paused() {
    let mut p = poll(AcfSource::Native);
    for i in 0..4u64 {
        let fx = tick(&mut p, dl(2, 0, 0, 3, 6), i * 3000);
        for s in statuses(&fx) {
            assert!(s.get("context").is_none());
        }
    }
}

// ---- macOS live download monitor -------------------------------------------------------------

const LIVE_TOTAL: u64 = 8_736_151_712;

fn live(done: f64, speed: Option<f64>) -> Option<DownloadReading> {
    Some(DownloadReading {
        bytes_done: done,
        bytes_total: LIVE_TOTAL as f64,
        speed_bytes_per_sec: speed,
    })
}

fn mac_tick(p: &mut ActiveInstall, monitor: Option<DownloadReading>, now_ms: u64) -> Vec<Effect> {
    p.ticks += 1;
    let mut o = obs(dl(1026, 0, LIVE_TOTAL, 0, 0), now_ms);
    o.platform = Platform::Darwin;
    o.monitor = monitor;
    install_step(APP, p, &o).effects
}

#[test]
fn live_percent_speed_and_eta_while_the_acf_is_frozen_at_zero() {
    let mut p = poll(AcfSource::Native);
    mac_tick(&mut p, live(4_368_075_856.0, Some(25e6)), 0);
    let fx = mac_tick(&mut p, live(4_368_075_856.0, Some(25e6)), 3000);
    let pr = &progress(&fx)[0]["progress"];
    assert_eq!(pr["percent"], 50);
    assert!((pr["downSpeed"].as_f64().unwrap() - 25e6 / (1024.0 * 1024.0)).abs() < 1e-5);
    assert_ne!(pr["eta"], "");
}

#[test]
fn live_overshoot_is_capped_at_99() {
    let mut p = poll(AcfSource::Native);
    let fx = mac_tick(&mut p, live(8_770_693_182.0, Some(25e6)), 0);
    assert_eq!(progress(&fx)[0]["progress"]["percent"], 99);
}

#[test]
fn never_paused_while_the_live_counter_advances() {
    let mut p = poll(AcfSource::Native);
    for i in 1..=5u64 {
        let fx = mac_tick(&mut p, live((i * 100_000_000) as f64, Some(25e6)), i * 3000);
        for s in statuses(&fx) {
            assert_ne!(s["context"], "steam-paused");
        }
    }
}

#[test]
fn paused_when_the_live_counter_freezes() {
    let mut p = poll(AcfSource::Native);
    let mut last = vec![];
    for i in 0..5u64 {
        last = mac_tick(&mut p, live(100_000_000.0, Some(25e6)), i * 3000);
    }
    assert_eq!(statuses(&last).last().unwrap()["context"], "steam-paused");
}

#[test]
fn falls_back_to_the_acf_when_the_monitor_has_no_reading() {
    let mut p = poll(AcfSource::Native);
    let fx = mac_tick(&mut p, None, 0);
    let pr = &progress(&fx)[0]["progress"];
    assert_eq!(pr["percent"], 0);
    assert!(pr.get("downSpeed").is_none());
}

#[test]
fn the_monitor_is_ignored_on_a_bottle_poll() {
    let mut p = poll(AcfSource::Bottle);
    let fx = mac_tick(&mut p, live(5e9, Some(25e6)), 0);
    for payload in progress(&fx) {
        assert_eq!(payload["progress"]["percent"], 0);
    }
}

#[test]
fn the_monitor_is_ignored_off_macos() {
    let mut p = poll(AcfSource::Native);
    p.ticks += 1;
    let mut o = obs(dl(1026, 0, LIVE_TOTAL, 0, 0), 0);
    o.monitor = live(5e9, Some(25e6));
    let fx = install_step(APP, &mut p, &o).effects;
    assert_eq!(progress(&fx)[0]["progress"]["percent"], 0);
}

// ---- Windows live source (steam.exe write counter, win_live.rs) ------------------------------
//
// Windows Steam writes the ACF byte fields at setup (1026 with the totals, downloaded 0) and at
// the commit only, so the ACF reads 0 % for the whole download. The numbers are the live run of
// 2026-11-19 (Banner Saga 237990).

const WIN_TO_DOWNLOAD: u64 = 3_184_165_888;
const WIN_TO_STAGE: u64 = 3_335_661_215;

/// The Windows ACF mid-download: 1026, both totals set, nothing downloaded or staged.
fn win_acf() -> AcfState {
    dl(1026, 0, WIN_TO_DOWNLOAD, 0, WIN_TO_STAGE)
}

fn delegated(source: AcfSource) -> ActiveInstall {
    let mut p = poll(source);
    p.delegated_to_steam_client = true;
    p
}

/// What the Windows source reads once `written` bytes were written against the ACF's totals.
fn win_reading(written: u64) -> Option<DownloadReading> {
    reading_from_write_delta(written, WIN_TO_STAGE, WIN_TO_DOWNLOAD)
}

fn plat_tick(
    p: &mut ActiveInstall,
    platform: Platform,
    monitor: Option<DownloadReading>,
    now_ms: u64,
) -> Vec<Effect> {
    p.ticks += 1;
    let mut o = obs(win_acf(), now_ms);
    o.platform = platform;
    o.monitor = monitor;
    install_step(APP, p, &o).effects
}

fn percent(fx: &[Effect]) -> i64 {
    progress(fx)[0]["progress"]["percent"].as_i64().unwrap()
}

#[test]
fn a_windows_delegated_poll_shows_the_write_counter_progress_while_the_acf_is_frozen() {
    let mut p = delegated(AcfSource::Native);
    let fx = plat_tick(&mut p, Platform::Win32, win_reading(WIN_TO_STAGE / 2), 0);
    assert_eq!(percent(&fx), 50);
    let pr = &progress(&fx)[0]["progress"];
    // The byte figure is on Steam's own download scale, half of 3.18 GB.
    assert_eq!(pr["bytes"], "1.48 GiB");
}

#[test]
fn the_windows_percent_climbs_with_the_counter_and_never_reaches_100() {
    let mut p = delegated(AcfSource::Native);
    let mut last = -1;
    for (i, frac) in [0.0, 0.1, 0.45, 0.8, 0.991, 3.0].iter().enumerate() {
        let written = (WIN_TO_STAGE as f64 * frac) as u64;
        let fx = plat_tick(
            &mut p,
            Platform::Win32,
            win_reading(written),
            i as u64 * 3000,
        );
        let now = percent(&fx);
        assert!(now >= last, "never backwards: {last} then {now}");
        assert!(now <= 99, "100 % comes only from StateFlags 4, got {now}");
        last = now;
    }
    assert_eq!(last, 99);
}

#[test]
fn the_windows_source_gives_a_speed_and_an_eta_and_is_never_paused_while_it_advances() {
    let mut p = delegated(AcfSource::Native);
    plat_tick(&mut p, Platform::Win32, win_reading(0), 0);
    // 15 MB/s of staged writes for 3 s.
    let fx = plat_tick(&mut p, Platform::Win32, win_reading(45_000_000), 3000);
    let pr = &progress(&fx)[0]["progress"];
    assert!(pr["downSpeed"].as_f64().unwrap() > 0.0);
    assert_ne!(pr["eta"], "");
    for i in 2..=6u64 {
        let fx = plat_tick(
            &mut p,
            Platform::Win32,
            win_reading(i * 45_000_000),
            i * 3000,
        );
        for s in statuses(&fx) {
            assert_ne!(s["context"], "steam-paused");
        }
    }
}

#[test]
fn a_frozen_windows_counter_reads_as_paused() {
    let mut p = delegated(AcfSource::Native);
    let mut last = vec![];
    for i in 0..5u64 {
        last = plat_tick(&mut p, Platform::Win32, win_reading(200_000_000), i * 3000);
    }
    assert_eq!(statuses(&last).last().unwrap()["context"], "steam-paused");
}

#[test]
fn a_windows_poll_without_a_reading_falls_back_to_the_acf() {
    let mut p = delegated(AcfSource::Native);
    let fx = plat_tick(&mut p, Platform::Win32, None, 0);
    assert_eq!(percent(&fx), 0);
    assert!(progress(&fx)[0]["progress"].get("downSpeed").is_none());
}

#[test]
fn the_windows_reading_is_ignored_unless_the_poll_is_a_delegated_native_install() {
    let live = win_reading(WIN_TO_STAGE / 2);
    // Not delegated: GameLib's own depot download, nothing Steam is downloading.
    let mut p = poll(AcfSource::Native);
    assert_eq!(percent(&plat_tick(&mut p, Platform::Win32, live, 0)), 0);
    // A depot handoff.
    let mut p = handoff(AcfSource::Native);
    p.delegated_to_steam_client = true;
    assert_eq!(percent(&plat_tick(&mut p, Platform::Win32, live, 0)), 0);
    // A bottle poll.
    let mut p = delegated(AcfSource::Bottle);
    assert_eq!(percent(&plat_tick(&mut p, Platform::Win32, live, 0)), 0);
}

#[test]
fn linux_stays_acf_only_even_for_a_delegated_poll() {
    let mut p = delegated(AcfSource::Native);
    let fx = plat_tick(&mut p, Platform::Linux, win_reading(WIN_TO_STAGE / 2), 0);
    assert_eq!(percent(&fx), 0);
}

#[test]
fn windows_live_applies_matches_the_step_gate() {
    assert!(windows_live_applies(
        Platform::Win32,
        &delegated(AcfSource::Native)
    ));
    assert!(!windows_live_applies(
        Platform::Win32,
        &poll(AcfSource::Native)
    ));
    assert!(!windows_live_applies(
        Platform::Win32,
        &delegated(AcfSource::Bottle)
    ));
    assert!(!windows_live_applies(
        Platform::Win32,
        &delegated(AcfSource::Bridge)
    ));
    let mut h = handoff(AcfSource::Native);
    h.delegated_to_steam_client = true;
    assert!(!windows_live_applies(Platform::Win32, &h));
    assert!(!windows_live_applies(
        Platform::Darwin,
        &delegated(AcfSource::Native)
    ));
    assert!(!windows_live_applies(
        Platform::Linux,
        &delegated(AcfSource::Native)
    ));
}

// ---- 1026 handoff and the waiting notice -----------------------------------------------------

#[test]
fn native_handoff_at_1026_emits_waiting_context_and_the_native_notify() {
    let mut p = handoff(AcfSource::Native);
    let fx = tick(&mut p, dl(1026, 0, 0, 0, 0), 0);
    let s = statuses(&fx);
    assert_eq!(s[0]["status"], "installing");
    assert_eq!(s[0]["context"], "steam-waiting-for-restart");
    assert_eq!(restart_notifies(&fx), 1);
    // no incomplete marker for a native handoff
    assert!(!fx.iter().any(|e| matches!(
        e,
        Effect::Transition {
            event: StateEvent::InstallIncomplete { .. },
            ..
        }
    )));
}

#[test]
fn waiting_notice_fires_exactly_once_across_ticks() {
    let mut p = handoff(AcfSource::Native);
    let mut total = 0;
    for i in 0..3u64 {
        total += restart_notifies(&tick(&mut p, dl(1026, 0, 0, 0, 0), i * 3000));
    }
    assert_eq!(total, 1);
    assert!(p.notified_waiting);
}

#[test]
fn no_waiting_notice_for_an_off_path_poll_at_1026() {
    let mut p = poll(AcfSource::Native);
    for i in 0..3u64 {
        let fx = tick(
            &mut p,
            dl(1026, 1_000_000 * (i + 1), 10_000_000, 0, 0),
            i * 3000,
        );
        assert_eq!(notifies(&fx), 0);
        for s in statuses(&fx) {
            assert_eq!(s["status"], "installing");
            assert!(s.get("context").is_none());
        }
        let pr = &progress(&fx)[0]["progress"];
        assert!(pr["percent"].as_i64().unwrap() > 0);
    }
}

#[test]
fn cold_start_tick_of_an_off_path_1026_poll_never_flashes_waiting() {
    let mut p = poll(AcfSource::Native);
    let fx = tick(&mut p, dl(1026, 5_000_000, 10_000_000, 0, 0), 0);
    assert!(statuses(&fx)[0].get("context").is_none());
    assert_eq!(notifies(&fx), 0);
}

#[test]
fn state_flags_1042_is_an_ordinary_download_regardless_of_handoff() {
    for is_handoff in [false, true] {
        let mut p = poll(AcfSource::Native);
        p.handoff.is_native_handoff = is_handoff;
        let fx = tick(&mut p, dl(1042, 5_000_000, 10_000_000, 0, 0), 0);
        assert!(statuses(&fx)[0].get("context").is_none());
        assert_eq!(progress(&fx)[0]["progress"]["percent"], 50);
        assert_eq!(notifies(&fx), 0);
    }
}

#[test]
fn plain_active_download_sets_no_context() {
    let mut p = poll(AcfSource::Native);
    let fx = tick(&mut p, dl(2, 1, 10, 0, 0), 0);
    assert!(statuses(&fx)[0].get("context").is_none());
}

#[test]
fn a_non_1026_active_download_fires_no_waiting_notice() {
    let mut p = handoff(AcfSource::Native);
    let fx = tick(&mut p, dl(2, 1, 10, 0, 0), 0);
    assert_eq!(notifies(&fx), 0);
}

#[test]
fn delegated_download_carries_managed_by_steam() {
    let mut p = poll(AcfSource::Native);
    p.delegated_to_steam_client = true;
    let fx = tick(&mut p, dl(2, 1, 10, 0, 0), 0);
    assert_eq!(statuses(&fx)[0]["managedBySteam"], true);
}

// ---- bottle 1026 -----------------------------------------------------------------------------

#[test]
fn bottle_1026_marks_incomplete_before_done_and_stops() {
    let mut p = handoff(AcfSource::Bottle);
    p.ticks += 1;
    let step = install_step(APP, &mut p, &obs(dl(1026, 0, 0, 0, 0), 0));
    assert!(step.stop);
    // The installIncomplete state event is queued; gameStatusUpdate done only follows its ack.
    let Some(Effect::Transition { event, then }) = step
        .effects
        .iter()
        .find(|e| matches!(e, Effect::Transition { .. }))
    else {
        panic!("no transition");
    };
    assert_eq!(
        event,
        &StateEvent::InstallIncomplete {
            app_id: APP.into(),
            seq: 1
        }
    );
    let after = then.clone().resolve(&AckReply {
        applied: true,
        ..Default::default()
    });
    let s = statuses(&after);
    assert_eq!(s.len(), 1);
    assert_eq!(s[0]["status"], "done");
    // nothing before the ack names a context or a notification
    assert!(statuses(&step.effects).is_empty());
    assert_eq!(notifies(&step.effects), 0);
    assert!(step.effects.iter().any(
        |e| matches!(e, Effect::Log { level: LogLevel::Warn, message } if message.contains("marked incomplete"))
    ));
    assert!(matches!(then, Continuation::InstallIncomplete { .. }));
}

#[test]
fn bridge_1026_is_not_converted_to_incomplete() {
    let mut p = handoff(AcfSource::Bridge);
    p.ticks += 1;
    let step = install_step(APP, &mut p, &obs(dl(1026, 0, 0, 0, 0), 0));
    assert!(!step.stop);
    assert!(!step
        .effects
        .iter()
        .any(|e| matches!(e, Effect::Transition { .. })));
}

#[test]
fn hand_written_1026_bottle_manifest_reads_as_installing_via_the_bottle_poller() {
    // D-15: not a GameLib handoff poll (no isNativeHandoff), so 1026 is an ordinary download.
    let mut p = poll(AcfSource::Bottle);
    let fx = tick(&mut p, dl(1026, 0, 0, 0, 0), 0);
    let s = statuses(&fx);
    assert_eq!(s[0]["status"], "installing");
    assert!(s[0].get("context").is_none());
    assert!(!fx.iter().any(|e| matches!(e, Effect::Transition { .. })));
}

// ---- absent -----------------------------------------------------------------

#[test]
fn absent_before_any_manifest_is_a_no_op() {
    let mut p = poll(AcfSource::Native);
    let step = install_step(APP, &mut p, &obs(AcfState::Absent, 0));
    assert!(step.effects.is_empty() && !step.stop);
    assert_eq!(p.handoff.absent_ticks_since_seen, 0);
}

#[test]
fn unknown_state_skips_the_tick() {
    let mut p = poll(AcfSource::Native);
    p.handoff.seen_downloading = true;
    let step = install_step(APP, &mut p, &obs(AcfState::Unknown, 0));
    assert!(step.effects.is_empty() && !step.stop);
    assert_eq!(p.handoff.absent_ticks_since_seen, 0);
}

#[test]
fn absent_counts_only_after_a_manifest_was_seen_and_resets_on_download() {
    let mut p = poll(AcfSource::Native);
    p.handoff.seen_downloading = true;
    install_step(APP, &mut p, &obs(AcfState::Absent, 0));
    install_step(APP, &mut p, &obs(AcfState::Absent, 0));
    assert_eq!(p.handoff.absent_ticks_since_seen, 2);
    tick(&mut p, dl(2, 1, 10, 0, 0), 0);
    assert_eq!(p.handoff.absent_ticks_since_seen, 0);
}

#[test]
fn absent_never_stops_the_step_itself() {
    let mut p = poll(AcfSource::Native);
    p.handoff.seen_downloading = true;
    for _ in 0..MANIFEST_GONE_TICKS + 3 {
        assert!(!install_step(APP, &mut p, &obs(AcfState::Absent, 0)).stop);
    }
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
