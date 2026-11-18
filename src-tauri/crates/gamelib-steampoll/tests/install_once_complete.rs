//! Port of the installed / completion cases of `library.installPollOnce.test.ts`, plus update delegation and the Mac arch follow-up. Mapping table: 80-14-SUMMARY.md.

use gamelib_steampoll::acf_state::{AcfSource, AcfState, AcfUpdateFields, PollRoots};
use gamelib_steampoll::effects::{Continuation, Effect};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::host::{NotifyText, RunOutput};
use gamelib_steampoll::install_once::{
    install_step, mac_arch_verdict_effect, run_mac_arch_followup, wants_mac_arch_probe,
    ActiveInstall, InstallObservation, InstallStep,
};
use gamelib_steampoll::mac_arch::MacArch;
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::testing::ScriptedRunner;
use gamelib_steampoll::update::AwaitingUpdate;
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

fn installed_acf() -> AcfState {
    AcfState::Installed {
        state_flags: 4,
        install_path: "/steam/steamapps/common/csgo".into(),
        size_on_disk: "50000".into(),
        buildid: Some("9876".into()),
    }
}

fn obs(acf: AcfState) -> InstallObservation {
    InstallObservation {
        acf,
        update_fields: None,
        monitor: None,
        now_ms: 0,
        platform: Platform::Linux,
        bridge_finalized: false,
        install_app_outcome: None,
        seq: 7,
    }
}

fn acked() -> AckReply {
    AckReply {
        applied: true,
        title: Some("CS:GO".into()),
        ..Default::default()
    }
}

/// The ordered effects one completed tick produces: the step's own effects with every
/// `Transition` replaced by itself followed by its post-ack effects (the order `apply_effects`
/// runs them in).
fn flatten(effects: &[Effect]) -> Vec<Effect> {
    let mut out = vec![];
    for e in effects {
        out.push(e.clone());
        if let Effect::Transition { then, .. } = e {
            out.extend(then.clone().resolve(&acked()));
        }
    }
    out
}

fn full(p: &mut ActiveInstall, o: &InstallObservation) -> (InstallStep, Vec<Effect>) {
    let step = install_step(APP, p, o);
    let flat = flatten(&step.effects);
    (step, flat)
}

fn statuses(effects: &[Effect]) -> Vec<Value> {
    effects
        .iter()
        .filter_map(|e| match e {
            Effect::Frontend { channel, args } if channel == "gameStatusUpdate" => {
                Some(args[0].clone())
            }
            _ => None,
        })
        .collect()
}

fn notify_keys(effects: &[Effect]) -> Vec<String> {
    effects
        .iter()
        .filter_map(|e| match e {
            Effect::Notify(n) => Some(match &n.body {
                NotifyText::Key { key, .. } => key.clone(),
                NotifyText::Literal(s) => s.clone(),
            }),
            _ => None,
        })
        .collect()
}

fn installed_event(effects: &[Effect]) -> Option<&StateEvent> {
    effects.iter().find_map(|e| match e {
        Effect::Transition {
            event: ev @ StateEvent::Installed { .. },
            ..
        } => Some(ev),
        _ => None,
    })
}

// ---- completion ------------------------------------------------------------------------------

#[test]
fn installed_sends_the_state_event_then_done_after_the_ack() {
    let mut p = poll(AcfSource::Native);
    let (step, flat) = full(&mut p, &obs(installed_acf()));
    assert!(step.stop);
    assert_eq!(
        installed_event(&step.effects),
        Some(&StateEvent::Installed {
            app_id: APP.into(),
            seq: 7,
            source: "native".into(),
            install_path: "/steam/steamapps/common/csgo".into(),
            size_on_disk: "50000".into(),
            buildid: Some("9876".into()),
        })
    );
    // Nothing the webview sees precedes the state event (R2/D-05).
    assert!(matches!(flat[0], Effect::Transition { .. }));
    let s = statuses(&flat);
    assert_eq!(s.len(), 1);
    assert_eq!(s[0]["status"], "done");
    assert_eq!(s[0]["runner"], "steam");
    // Before the ack the step itself emitted no status.
    assert!(statuses(&step.effects).is_empty());
}

#[test]
fn installed_fires_installation_finished_once_with_the_ack_title() {
    let mut p = poll(AcfSource::Native);
    let (_, flat) = full(&mut p, &obs(installed_acf()));
    let notifies: Vec<_> = flat
        .iter()
        .filter_map(|e| match e {
            Effect::Notify(n) => Some(n.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(notifies.len(), 1);
    assert_eq!(notifies[0].title, NotifyText::Literal("CS:GO".into()));
    assert!(matches!(
        &notifies[0].body,
        NotifyText::Key { key, default, .. }
            if key == "notify.install.finished" && default == "Installation Finished"
    ));
}

#[test]
fn off_path_poll_fires_no_restart_steam_notice() {
    let mut p = poll(AcfSource::Native);
    let (_, flat) = full(&mut p, &obs(installed_acf()));
    assert_eq!(notify_keys(&flat), vec!["notify.install.finished"]);
}

#[test]
fn a_native_handoff_fires_finished_and_never_the_restart_steam_notice() {
    // Phase 81 (D-11/D-14): restart-on-Play replaced the toast for native installs, on every OS.
    for platform in [Platform::Darwin, Platform::Win32, Platform::Linux] {
        let mut p = handoff(AcfSource::Native);
        let mut o = obs(installed_acf());
        o.platform = platform;
        let (step, flat) = full(&mut p, &o);
        assert!(installed_event(&step.effects).is_some(), "{platform:?}");
        assert_eq!(
            notify_keys(&flat),
            vec!["notify.install.finished"],
            "{platform:?}"
        );
        assert!(!p.notified_waiting, "{platform:?}");
    }
}

#[test]
fn a_bottle_handoff_still_fires_the_restart_steam_notice() {
    // A bottle handoff is adopted only by a bottled-Steam restart; restart-on-Play does not apply.
    let mut p = handoff(AcfSource::Bottle);
    let (step, flat) = full(&mut p, &obs(installed_acf()));
    assert!(installed_event(&step.effects).is_some());
    assert_eq!(
        notify_keys(&flat),
        vec!["notify.install.finished", "steam.waitingForSteam.notify"]
    );
    assert!(p.notified_waiting);
}

#[test]
fn bottle_install_event_carries_the_bottle_source_for_the_windows_platform() {
    let mut p = poll(AcfSource::Bottle);
    let mut o = obs(installed_acf());
    // isMac equivalent: the platform of the host does not change the bottle verdict
    o.platform = Platform::Darwin;
    let (step, _) = full(&mut p, &o);
    let Some(StateEvent::Installed { source, .. }) = installed_event(&step.effects) else {
        panic!("no installed event");
    };
    assert_eq!(source, "bottle");
    // no Mac arch probe for a bottle install
    assert!(step.mac_arch.is_none());
}

// ---- bridge ----------------------------------------------------------------------------------

#[test]
fn bridge_reports_finishing_not_done() {
    let mut p = handoff(AcfSource::Bridge);
    let (step, flat) = full(&mut p, &obs(installed_acf()));
    assert!(step.stop);
    let s = statuses(&flat);
    assert_eq!(s.len(), 1);
    assert_eq!(s[0]["status"], "installing");
    assert_eq!(s[0]["context"], "steam-bridge-finishing");
    assert!(!s.iter().any(|v| v["status"] == "done"));
    assert!(matches!(
        installed_event(&step.effects),
        Some(StateEvent::Installed { source, .. }) if source == "bridge"
    ));
}

#[test]
fn bridge_fires_neither_toast() {
    let mut p = handoff(AcfSource::Bridge);
    let (_, flat) = full(&mut p, &obs(installed_acf()));
    assert!(notify_keys(&flat).is_empty());
}

#[test]
fn bridge_finalized_installer_sends_no_status_but_still_flips() {
    let mut p = handoff(AcfSource::Bridge);
    let mut o = obs(installed_acf());
    o.bridge_finalized = true;
    let (step, flat) = full(&mut p, &o);
    assert!(installed_event(&step.effects).is_some());
    assert!(statuses(&flat).is_empty());
    assert!(notify_keys(&flat).is_empty());
}

#[test]
fn bridge_marker_unset_or_cleared_shows_finishing() {
    let mut p = handoff(AcfSource::Bridge);
    let (_, flat) = full(&mut p, &obs(installed_acf()));
    assert_eq!(statuses(&flat)[0]["context"], "steam-bridge-finishing");
}

// ---- depot-skipped notice --------------------------------------------------------------------

fn depot_notices(effects: &[Effect]) -> Vec<(String, Value)> {
    effects
        .iter()
        .filter_map(|e| match e {
            Effect::Notify(n) => match &n.body {
                NotifyText::Key { key, params, .. }
                    if key == "steam.download.notify.depotSkipped" =>
                {
                    Some((key.clone(), Value::Object(params.clone())))
                }
                _ => None,
            },
            _ => None,
        })
        .collect()
}

#[test]
fn skipped_depot_notice_names_the_depot_in_the_params_without_a_count_key() {
    let mut p = poll(AcfSource::Native);
    p.handoff.skipped_depots = vec!["229006".into()];
    let (_, flat) = full(&mut p, &obs(installed_acf()));
    let notices = depot_notices(&flat);
    assert_eq!(notices.len(), 1);
    assert_eq!(notices[0].1["depots"], "229006");
    // i18next reserves `count` for pluralization.
    assert!(notices[0].1.get("count").is_none());
}

#[test]
fn several_skipped_depots_join_into_one_comma_separated_value() {
    let mut p = poll(AcfSource::Native);
    p.handoff.skipped_depots = vec!["1".into(), "2".into(), "3".into()];
    let (_, flat) = full(&mut p, &obs(installed_acf()));
    assert_eq!(depot_notices(&flat)[0].1["depots"], "1, 2, 3");
}

#[test]
fn all_three_notices_fire_in_one_confirmed_installed_tick() {
    // Bottle source: it is the only handoff that still gets the restart-Steam notice.
    let mut p = handoff(AcfSource::Bottle);
    p.handoff.skipped_depots = vec!["229006".into()];
    let (_, flat) = full(&mut p, &obs(installed_acf()));
    // The shared-guard trap: the two fire-once flags are independent, order as in the TS.
    assert_eq!(
        notify_keys(&flat),
        vec![
            "notify.install.finished",
            "steam.download.notify.depotSkipped",
            "steam.waitingForSteam.notify"
        ]
    );
}

#[test]
fn skip_notice_fires_at_most_once_per_poll() {
    let mut p = poll(AcfSource::Native);
    p.handoff.skipped_depots = vec!["229006".into()];
    let (_, first) = full(&mut p, &obs(installed_acf()));
    let (_, second) = full(&mut p, &obs(installed_acf()));
    assert_eq!(depot_notices(&first).len(), 1);
    assert_eq!(depot_notices(&second).len(), 0);
}

#[test]
fn no_skip_notice_when_nothing_was_skipped() {
    let mut p = poll(AcfSource::Native);
    let (_, flat) = full(&mut p, &obs(installed_acf()));
    assert!(depot_notices(&flat).is_empty());
    assert_eq!(notify_keys(&flat), vec!["notify.install.finished"]);
}

#[test]
fn skip_notice_independent_of_the_restart_flag() {
    // An OFF-path poll is never given skipped depots; the notice also does not consume the
    // restart-Steam fire-once flag.
    let mut p = poll(AcfSource::Native);
    p.handoff.skipped_depots = vec!["9".into()];
    full(&mut p, &obs(installed_acf()));
    assert!(p.notified_depot_skipped);
    assert!(!p.notified_waiting);
}

// ---- installed on the first tick (Phase 81 D-11) -----------------------------------------------

#[test]
fn a_native_handoff_reports_installed_on_the_first_tick_on_every_platform() {
    // There is no hold: no steam-waiting-for-restart status, no wait.
    for platform in [Platform::Darwin, Platform::Win32, Platform::Linux] {
        let mut p = handoff(AcfSource::Native);
        let mut o = obs(installed_acf());
        o.platform = platform;
        let step = install_step(APP, &mut p, &o);
        assert!(step.stop, "{platform:?}: completes on the first tick");
        assert!(
            installed_event(&step.effects).is_some(),
            "{platform:?}: Installed fires on that tick"
        );
        assert!(
            !statuses(&step.effects)
                .iter()
                .any(|s| s["context"] == "steam-waiting-for-restart"),
            "{platform:?}: never waits for a restart"
        );
    }
}

// ---- update delegation -----------------------------------------------------------------------

fn update_fields(flags: u32, build: &str, target: Option<&str>) -> AcfUpdateFields {
    AcfUpdateFields {
        steamapps_dir: "/s".into(),
        buildid: build.into(),
        target_build_id: target.map(str::to_string),
        state_flags: flags,
        bytes_to_download: 0,
        bytes_downloaded: 0,
        scheduled_auto_update: 0,
        beta_key: None,
    }
}

#[test]
fn awaiting_update_delegates_to_update_step() {
    let mut p = poll(AcfSource::Native);
    p.awaiting_update = Some(AwaitingUpdate::new("100", Some("200"), 0));
    p.ticks = 1;
    // a pending update (UpdateRequired) on the starting build reports 'updating'
    let mut o = obs(installed_acf());
    o.update_fields = Some(update_fields(6, "100", Some("200")));
    let step = install_step(APP, &mut p, &o);
    assert!(!step.stop);
    let s = statuses(&step.effects);
    assert_eq!(s[0]["status"], "updating");
    assert_eq!(s[0]["managedBySteam"], true);
    // the install ACF arm did not run
    assert!(installed_event(&step.effects).is_none());
}

#[test]
fn awaiting_update_completion_returns_update_steps_effects() {
    let mut p = poll(AcfSource::Native);
    p.awaiting_update = Some(AwaitingUpdate::new("100", Some("200"), 0));
    p.ticks = 1;
    let mut o = obs(installed_acf());
    o.update_fields = Some(update_fields(4, "200", Some("200")));
    let step = install_step(APP, &mut p, &o);
    assert!(step.stop);
    assert!(step.effects.iter().any(|e| matches!(
        e,
        Effect::Transition {
            event: StateEvent::UpdateDone {
                completed: true,
                ..
            },
            then: Continuation::UpdateDone { .. }
        }
    )));
}

#[test]
fn awaiting_update_surfaces_the_install_app_retry_request() {
    let mut p = poll(AcfSource::Native);
    p.awaiting_update = Some(AwaitingUpdate::new("100", Some("200"), 0).with_retry(Some("/lib")));
    p.ticks = 3;
    let mut o = obs(installed_acf());
    o.update_fields = Some(update_fields(4, "100", Some("200")));
    let step = install_step(APP, &mut p, &o);
    assert_eq!(
        step.update.as_ref().map(|u| u.library_path.clone()),
        Some(Some("/lib".to_string()))
    );
}

// ---- Mac arch follow-up ----------------------------------------------------------------------

#[test]
fn native_mac_install_requests_a_follow_up_probe() {
    let mut p = poll(AcfSource::Native);
    let mut o = obs(installed_acf());
    o.platform = Platform::Darwin;
    let step = install_step(APP, &mut p, &o);
    let f = step.mac_arch.expect("follow-up");
    assert_eq!(f.app_id, APP);
    assert_eq!(f.install_path, "/steam/steamapps/common/csgo");
    // not offered off macOS
    let mut p2 = poll(AcfSource::Native);
    assert!(install_step(APP, &mut p2, &obs(installed_acf()))
        .mac_arch
        .is_none());
}

#[test]
fn the_probe_runs_only_when_the_reply_asks_for_it() {
    assert!(!wants_mac_arch_probe(&AckReply::not_acked()));
    assert!(!wants_mac_arch_probe(&AckReply {
        applied: true,
        mac_arch_check: Some(false),
        ..Default::default()
    }));
    assert!(wants_mac_arch_probe(&AckReply {
        applied: true,
        mac_arch_check: Some(true),
        ..Default::default()
    }));
}

#[test]
fn the_verdict_is_a_state_event_with_no_post_ack_effects() {
    let e = mac_arch_verdict_effect(APP, 9, MacArch::Bits32);
    let Effect::Transition { event, then } = e else {
        panic!("not a transition");
    };
    assert_eq!(
        event,
        StateEvent::MacArchVerdict {
            app_id: APP.into(),
            seq: 9,
            verdict: "32".into()
        }
    );
    assert_eq!(then.resolve(&acked()), vec![]);
}

#[tokio::test]
async fn followup_probe_turns_archs_into_a_verdict_event() {
    let dir = tempfile::tempdir().unwrap();
    let app = dir.path().join("Game.app/Contents/MacOS");
    std::fs::create_dir_all(&app).unwrap();
    std::fs::write(app.join("Game"), b"x").unwrap();
    let mut p = poll(AcfSource::Native);
    let mut o = obs(AcfState::Installed {
        state_flags: 4,
        install_path: dir.path().to_string_lossy().into_owned(),
        size_on_disk: "1".into(),
        buildid: None,
    });
    o.platform = Platform::Darwin;
    let f = install_step(APP, &mut p, &o).mac_arch.expect("follow-up");

    let bin = gamelib_steampoll::mac_arch::locate_macho_binary(dir.path()).expect("binary");
    let runner = ScriptedRunner::default();
    // lipo answers "i386": a 32-bit-only binary.
    runner.on(
        &format!("lipo -archs {}", bin.to_string_lossy()),
        vec![RunOutput {
            code: Some(0),
            stdout: "i386\n".into(),
            stderr: String::new(),
        }],
    );
    let e = run_mac_arch_followup(&runner, Platform::Darwin, &f, 11).await;
    assert!(matches!(
        e,
        Some(Effect::Transition {
            event: StateEvent::MacArchVerdict { seq: 11, .. },
            then: Continuation::None
        })
    ));
}
