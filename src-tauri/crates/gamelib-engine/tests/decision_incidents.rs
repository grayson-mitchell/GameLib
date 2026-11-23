//! The inconclusive pre-flight incidents of `engineDecision.test.ts`, as behavioural tests (87-46; D-08, D-16).
//!
//! WR-01 as shipped: a CrossOver pre-flight that cannot corroborate a failure (an invalid bottle name,
//! a timeout while the bottle is busy or a game runs, a page read) is *inconclusive*, and an inconclusive
//! pre-flight never demotes the bottle. The decision keeps the engine the bottle's marker records
//! (`reason=cx-inconclusive`), reads the marker and never writes it, stops no wineserver and shows no
//! toast. `golden_decision.rs` replays the same incidents through the 87-13 goldens; these tests name
//! each one and add the marker bytes and the toast, which a golden does not record.
//!
//! Each test builds its own fake profile (real files for CrossOver and the pinned engines, scripted
//! spawns for the `--demo-status` probe, `plutil` and the wineserver stop), so nothing here touches the
//! real profile. POSIX only, as the goldens are.
#![cfg(unix)]

mod common;

use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::sync::Arc;

use gamelib_core::process::SpecOutput;
use gamelib_engine::bottles::marker::{read_marker_summary, MarkerSummary};
use gamelib_engine::bottles::registry::EngineSelection;
use gamelib_engine::crossover::locate::CrossoverLocator;
use gamelib_engine::decision::launch::{decide_launch_engine, DecideArgs, LaunchDecision};
use gamelib_engine::decision::preflight::{
    preflight_crossover, CrossoverPreflight, MonitorPhase, PreflightArgs, ProbeTuning,
};
use gamelib_engine::engines::pinned_engine_paths;
use gamelib_engine::pins::{pins, EnginePin, EnginePins};
use gamelib_engine::testing::{FixedClock, RecordingLog, RecordingUi, ScriptedSpecRunner, UiEvent};
use serde_json::json;

use common::Profile;

const BIN_REL: &str = "Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin";
const BUILD: &str = "26.3.0.39832";
const BOTTLE: &str = "GameLib-gog-1207658924";
const STEAM_BOTTLE: &str = "GameLibSteamBridge-1";
const NON_STEAM_BOTTLE: &str = "GameLib-legendary-Quail";
const RETIRED_ID: &str = "wine-staging-11.1";
const WM: &str = "Wine-Staging-10.5";

/// One `--demo-status` probe answer.
#[derive(Clone, Copy)]
enum Probe {
    Timeout,
    NonZero,
    Healthy,
}

fn probe_output(probe: Probe) -> SpecOutput {
    match probe {
        Probe::Timeout => SpecOutput {
            code: None,
            timed_out: true,
            ..SpecOutput::default()
        },
        Probe::NonZero => SpecOutput {
            code: Some(1),
            stderr: "cxwine: bottle wrapper failed".to_string(),
            ..SpecOutput::default()
        },
        Probe::Healthy => SpecOutput {
            code: Some(0),
            stdout: "Standard version\n".to_string(),
            ..SpecOutput::default()
        },
    }
}

fn write_file(path: &Path, mode: u32) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, "").unwrap();
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode)).unwrap();
}

fn retired_pin(current: &EnginePin) -> EnginePin {
    let mut pin = current.clone();
    pin.id = RETIRED_ID.to_string();
    pin.label = "Wine-Staging 11.1 + DXVK-macOS 1.10.3 (built-in)".to_string();
    pin.wine.version = "11.1".to_string();
    pin.wine.archive_name = "wine-staging-11.1-osx64.tar.xz".to_string();
    pin
}

/// What a world is built with.
struct Setup {
    /// CrossOver installed (`wine` present and executable).
    crossover: bool,
    probe: Vec<Probe>,
    /// The current pin's files on disk.
    pin_installed: bool,
    /// The previous (retired) pin's files on disk, and in the table.
    retired: bool,
    /// The Wine Manager build `WM` listed and installed, with its binaries.
    wine_manager: bool,
}

impl Default for Setup {
    fn default() -> Setup {
        Setup {
            crossover: true,
            probe: vec![Probe::Healthy],
            pin_installed: true,
            retired: false,
            wine_manager: false,
        }
    }
}

struct World {
    profile: Profile,
    ctx: gamelib_engine::ctx::EngineCtx,
    runner: Arc<ScriptedSpecRunner>,
    log: Arc<RecordingLog>,
    ui: Arc<RecordingUi>,
    table: EnginePins,
}

fn base_env(profile: &Profile) -> Vec<(String, String)> {
    profile
        .home
        .env()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string_lossy().into_owned()))
        .collect()
}

fn world(setup: Setup) -> World {
    let profile = Profile::new();
    let bin_dir = profile.root().join(BIN_REL);
    if setup.crossover {
        write_file(&bin_dir.join("cxbottle"), 0o644);
        write_file(&bin_dir.join("wine"), 0o755);
    }

    let current = pins().unwrap().current.clone();
    let retired = retired_pin(&current);
    if setup.pin_installed || setup.retired {
        profile.build_engines("installed");
    }
    let root = profile.tools.join("steam-engines");
    if setup.retired {
        std::fs::rename(root.join(&current.id), root.join(&retired.id)).unwrap();
    }
    let table = EnginePins {
        current: current.clone(),
        previous: setup.retired.then(|| retired.clone()),
    };

    let wine_root = profile.tools.join("wine");
    let releases = if setup.wine_manager {
        json!([{
            "version": WM, "type": "Wine-Staging-macOS", "isInstalled": true,
            "installDir": wine_root.join(WM).to_string_lossy(),
        }])
    } else {
        json!([])
    };
    let store = profile.user_data.join("store/wine-downloader-info.json");
    std::fs::create_dir_all(store.parent().unwrap()).unwrap();
    std::fs::write(&store, json!({ "wine-releases": releases }).to_string()).unwrap();
    if setup.wine_manager {
        let wm_bin = wine_root.join(WM).join("Contents/Resources/wine/bin");
        write_file(&wm_bin.join("wine"), 0o755);
        write_file(&wm_bin.join("wineserver"), 0o755);
    }

    let wine = bin_dir.join("wine").to_string_lossy().into_owned();
    let mut runner = ScriptedSpecRunner::new(base_env(&profile));
    for probe in &setup.probe {
        runner = runner.on_program(&wine, probe_output(*probe));
    }
    let runner = Arc::new(
        runner
            .on_program(
                &bin_dir.join("wineserver").to_string_lossy(),
                SpecOutput {
                    code: Some(0),
                    ..SpecOutput::default()
                },
            )
            .on_program(
                "/usr/bin/plutil",
                SpecOutput {
                    code: Some(0),
                    stdout: format!("{BUILD}\n"),
                    ..SpecOutput::default()
                },
            ),
    );

    let log = Arc::new(RecordingLog::new());
    let ui = Arc::new(RecordingUi::new());
    let mut ctx = profile
        .ctx_with(log.clone(), Some(runner.clone()))
        .with_ui(ui.clone());
    ctx.clock = Arc::new(FixedClock::new(1));
    // The machine's own /Applications must not answer.
    ctx.crossover_locator = CrossoverLocator::with_system_applications(
        profile
            .root()
            .join("no-system-applications")
            .to_string_lossy()
            .into_owned(),
    );
    std::fs::create_dir_all(profile.root().join("tmp")).unwrap();
    World {
        profile,
        ctx,
        runner,
        log,
        ui,
        table,
    }
}

impl World {
    fn tuning(&self) -> ProbeTuning {
        ProbeTuning {
            base_env: Some(base_env(&self.profile)),
            timeout_ms: None,
            retry_settle_ms: Some(0),
        }
    }

    fn busy(&self, bottle: &str) {
        self.ctx.ledger.mark_game_running(None, bottle, "gog:9999");
    }

    fn args(&self, bottle: &str, setting: &str) -> DecideArgs {
        DecideArgs {
            key: "1".to_string(),
            bottle_name: bottle.to_string(),
            override_value: json!(setting),
            pins: Some(self.table.clone()),
            tuning: self.tuning(),
            ..DecideArgs::default()
        }
    }

    async fn decide(&self, args: DecideArgs) -> LaunchDecision {
        decide_launch_engine(&self.ctx, &args).await.unwrap()
    }

    fn pre_args(&self, bottle: &str) -> PreflightArgs {
        PreflightArgs {
            bottle_name: bottle.to_string(),
            key: Some("1".to_string()),
            tuning: self.tuning(),
            ..PreflightArgs::default()
        }
    }

    fn count(&self, program: &str) -> usize {
        self.runner
            .spawns()
            .iter()
            .filter(|s| s.program.ends_with(program))
            .count()
    }

    fn logs(&self) -> String {
        self.log
            .lines()
            .into_iter()
            .map(|(_, line)| line)
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn summary(
        &self,
        crossover: bool,
        pin_id: Option<&str>,
        wine_manager_version: Option<&str>,
        pin_wineserver_bin: Option<String>,
    ) -> Option<MarkerSummary> {
        Some(MarkerSummary {
            crossover,
            pin_id: pin_id.map(str::to_string),
            wine_manager_version: wine_manager_version.map(str::to_string),
            pin_wineserver_bin,
        })
    }

    fn with_marker(&self, mut args: DecideArgs, marker: Option<MarkerSummary>) -> DecideArgs {
        args.marker_view = marker;
        args
    }
}

fn long_name() -> String {
    "a".repeat(256)
}

fn used(decision: &LaunchDecision) -> &gamelib_engine::decision::launch::LaunchUse {
    match decision {
        LaunchDecision::Use(used) => used,
        other => panic!("expected use, got {other:?}"),
    }
}

fn is_inconclusive(preflight: &CrossoverPreflight) -> bool {
    matches!(
        preflight,
        CrossoverPreflight::Broken {
            inconclusive: true,
            ..
        }
    )
}

/// No toast, no dialog, no window raise: the decision only ever decides (the shell shows the notice).
fn assert_silent(world: &World) {
    assert_eq!(world.ui.events(), Vec::<UiEvent>::new());
}

// ---- the pre-flight itself (D-05, WR-07, D-16) ---------------------------------------------------------

#[tokio::test]
async fn an_invalid_bottle_name_is_inconclusive_with_no_probe_and_no_stop() {
    let w = world(Setup::default());
    let r = preflight_crossover(&w.ctx, &w.pre_args(&long_name())).await;
    assert!(is_inconclusive(&r), "{r:?}");
    assert_eq!(w.count("/wine"), 0);
    assert_eq!(w.count("/wineserver"), 0);
}

#[tokio::test]
async fn a_page_read_timeout_never_stops_a_wineserver_and_probes_once() {
    let w = world(Setup {
        probe: vec![Probe::Timeout],
        ..Setup::default()
    });
    let mut args = w.pre_args(BOTTLE);
    args.kill_on_timeout = Some(false);
    let r = preflight_crossover(&w.ctx, &args).await;
    assert!(is_inconclusive(&r), "{r:?}");
    assert_eq!(w.count("/wineserver"), 0);
    assert_eq!(w.count("/wine"), 1);
}

#[tokio::test]
async fn an_active_monitor_skips_the_stop_and_the_retry() {
    let w = world(Setup {
        probe: vec![Probe::Timeout],
        ..Setup::default()
    });
    let mut args = w.pre_args(BOTTLE);
    args.monitor_phase = Some(MonitorPhase::Running);
    let r = preflight_crossover(&w.ctx, &args).await;
    assert!(is_inconclusive(&r), "{r:?}");
    assert_eq!(w.count("/wineserver"), 0);
    assert_eq!(w.count("/wine"), 1);
}

#[tokio::test]
async fn another_game_running_in_the_bottle_skips_the_stop_and_the_retry() {
    let w = world(Setup {
        probe: vec![Probe::Timeout],
        ..Setup::default()
    });
    w.busy(BOTTLE);
    let r = preflight_crossover(&w.ctx, &w.pre_args(BOTTLE)).await;
    assert!(is_inconclusive(&r), "{r:?}");
    assert_eq!(w.count("/wineserver"), 0);
    assert_eq!(w.count("/wine"), 1);
}

#[tokio::test]
async fn with_no_monitor_and_an_idle_bottle_two_timeouts_are_broken_not_inconclusive() {
    // The regression guard: the corroborated failure still demotes.
    let w = world(Setup {
        probe: vec![Probe::Timeout, Probe::Timeout],
        ..Setup::default()
    });
    let r = preflight_crossover(&w.ctx, &w.pre_args(BOTTLE)).await;
    assert!(matches!(r, CrossoverPreflight::Broken { .. }), "{r:?}");
    assert!(!is_inconclusive(&r), "{r:?}");
    assert_eq!(w.count("/wine"), 2);
    assert!(w.count("/wineserver") >= 1);
}

#[tokio::test]
async fn the_launch_decision_hands_its_key_to_the_pre_flight_so_the_monitor_applies() {
    let w = world(Setup {
        probe: vec![Probe::Timeout],
        ..Setup::default()
    });
    let mut args = w.args(BOTTLE, "automatic");
    args.key = "77".to_string();
    args.monitor_phase = Some(MonitorPhase::Running);
    let d = w.decide(args).await;
    assert_eq!(d.reason(), Some("cx-inconclusive"));
    assert_eq!(w.count("/wineserver"), 0);
    assert_eq!(w.count("/wine"), 1);
}

// ---- Automatic and forced CrossOver on an inconclusive pre-flight ---------------------------------------

#[tokio::test]
async fn automatic_with_an_invalid_bottle_launches_on_crossover_not_cx_broken() {
    let w = world(Setup::default());
    let d = w.decide(w.args(&long_name(), "automatic")).await;
    let u = used(&d);
    match &u.selection {
        EngineSelection::Crossover {
            reason, bin_dir, ..
        } => {
            assert_eq!(reason, "cx-inconclusive");
            assert!(!bin_dir.is_empty());
        }
        other => panic!("expected crossover, got {other:?}"),
    }
    assert!(!u.needs_download);
    let lines = u.log_lines.join("\n");
    assert!(lines.contains("inconclusive"), "{lines}");
    assert!(lines.contains("reason=cx-inconclusive"), "{lines}");
    assert!(!lines.contains("reason=cx-healthy"), "{lines}");
    assert_silent(&w);
}

#[tokio::test]
async fn forced_crossover_with_an_invalid_bottle_is_usable_with_reason_override() {
    let w = world(Setup::default());
    let d = w.decide(w.args(&long_name(), "crossover")).await;
    assert_eq!(d.engine_kind(), Some("crossover"));
    assert_eq!(d.reason(), Some("override"));
}

#[tokio::test]
async fn automatic_with_a_busy_bottle_timeout_stays_on_crossover() {
    let w = world(Setup {
        probe: vec![Probe::Timeout],
        ..Setup::default()
    });
    w.busy(BOTTLE);
    let d = w.decide(w.args(BOTTLE, "automatic")).await;
    assert_eq!(d.engine_kind(), Some("crossover"));
    assert_eq!(d.reason(), Some("cx-inconclusive"));
    assert_eq!(
        w.count("/wineserver"),
        0,
        "a busy bottle's wineserver stays up"
    );
    assert_silent(&w);
}

#[tokio::test]
async fn a_crossover_marker_with_an_inconclusive_pre_flight_stays_on_crossover() {
    let w = world(Setup::default());
    let marker = w.summary(true, None, None, None);
    let d = w
        .decide(w.with_marker(w.args(&long_name(), "automatic"), marker.clone()))
        .await;
    assert_eq!(d.engine_kind(), Some("crossover"));
    assert_eq!(d.reason(), Some("cx-inconclusive"));

    let busy = world(Setup {
        probe: vec![Probe::Timeout],
        ..Setup::default()
    });
    busy.busy(BOTTLE);
    let d = busy
        .decide(busy.with_marker(busy.args(BOTTLE, "automatic"), marker))
        .await;
    assert_eq!(d.engine_kind(), Some("crossover"));
    assert_eq!(d.reason(), Some("cx-inconclusive"));
}

#[tokio::test]
async fn forced_crossover_ignores_a_non_crossover_marker() {
    let w = world(Setup::default());
    let marker = w.summary(false, Some("x"), None, None);
    let d = w
        .decide(w.with_marker(w.args(&long_name(), "crossover"), marker))
        .await;
    assert_eq!(d.engine_kind(), Some("crossover"));
    assert_eq!(d.reason(), Some("override"));
}

// ---- WR-01: a busy bottle with a non-crossover marker is not forced onto CrossOver ------------------------

async fn busy_non_crossover(
    w: &World,
    bottle: &str,
    marker: Option<MarkerSummary>,
    setting: &str,
) -> LaunchDecision {
    w.busy(bottle);
    w.decide(w.with_marker(w.args(bottle, setting), marker))
        .await
}

fn timeout_world(setup: Setup) -> World {
    world(Setup {
        probe: vec![Probe::Timeout],
        ..setup
    })
}

#[tokio::test]
async fn wr01_steam_busy_bottle_with_a_pinned_marker_keeps_the_pin() {
    let w = timeout_world(Setup::default());
    let current = w.table.current.id.clone();
    let marker = w.summary(false, Some(&current), None, None);
    let d = busy_non_crossover(&w, STEAM_BOTTLE, marker, "automatic").await;
    let u = used(&d);
    match &u.selection {
        EngineSelection::Pinned { pin_id, reason, .. } => {
            assert_eq!(pin_id, &current);
            assert_eq!(reason, "cx-inconclusive");
        }
        other => panic!("expected pinned, got {other:?}"),
    }
    assert!(!u.needs_download);
    assert_eq!(w.count("/wineserver"), 0);
    let lines = u.log_lines.join("\n");
    assert!(lines.contains("reason=cx-inconclusive"), "{lines}");
    assert!(!lines.contains("reason=cx-healthy"), "{lines}");
    assert_silent(&w);
}

#[tokio::test]
async fn wr01_non_steam_busy_bottle_with_a_pinned_marker_keeps_the_pin() {
    let w = timeout_world(Setup::default());
    let current = w.table.current.id.clone();
    let marker = w.summary(false, Some(&current), None, None);
    let d = busy_non_crossover(&w, NON_STEAM_BOTTLE, marker, "automatic").await;
    assert_eq!(d.engine_kind(), Some("pinned"));
    assert_eq!(d.reason(), Some("cx-inconclusive"));
}

#[tokio::test]
async fn a_marker_on_the_previous_pin_keeps_the_previous_pin() {
    let w = timeout_world(Setup {
        retired: true,
        pin_installed: false,
        ..Setup::default()
    });
    let marker = w.summary(false, Some(RETIRED_ID), None, None);
    let d = busy_non_crossover(&w, BOTTLE, marker, "automatic").await;
    match &used(&d).selection {
        EngineSelection::Pinned { pin_id, .. } => assert_eq!(pin_id, RETIRED_ID),
        other => panic!("expected pinned, got {other:?}"),
    }
}

#[tokio::test]
async fn a_non_crossover_marker_with_no_resolvable_engine_takes_the_crossover_branch() {
    let w = timeout_world(Setup::default());
    let marker = w.summary(false, None, None, None);
    let d = busy_non_crossover(&w, BOTTLE, marker, "automatic").await;
    assert_eq!(d.engine_kind(), Some("crossover"));
    assert_eq!(d.reason(), Some("cx-inconclusive"));
}

#[tokio::test]
async fn wr01_a_wine_manager_marker_keeps_its_build_steam_and_non_steam() {
    for bottle in [STEAM_BOTTLE, NON_STEAM_BOTTLE] {
        let w = timeout_world(Setup {
            wine_manager: true,
            ..Setup::default()
        });
        let marker = w.summary(false, None, Some(WM), None);
        let d = busy_non_crossover(&w, bottle, marker, "automatic").await;
        let u = used(&d);
        match &u.selection {
            EngineSelection::WineManager {
                manager_version,
                reason,
                ..
            } => {
                assert_eq!(manager_version, WM);
                assert_eq!(reason, "cx-inconclusive");
            }
            other => panic!("expected wine-manager, got {other:?}"),
        }
        assert!(!u.needs_download);
        assert_eq!(w.count("/wineserver"), 0);
        let lines = u.log_lines.join("\n");
        assert!(lines.contains("reason=cx-inconclusive"), "{lines}");
        assert!(!lines.contains("reason=cx-healthy"), "{lines}");
    }
}

#[tokio::test]
async fn wr01_a_retired_pin_id_keeps_its_recorded_engine() {
    for bottle in [STEAM_BOTTLE, NON_STEAM_BOTTLE] {
        let w = timeout_world(Setup {
            retired: true,
            pin_installed: false,
            ..Setup::default()
        });
        let retired = retired_pin(&w.table.current);
        let paths = pinned_engine_paths(&w.ctx, &retired);
        let marker = w.summary(
            false,
            Some(RETIRED_ID),
            None,
            Some(paths.wineserver_bin.clone()),
        );
        let d = busy_non_crossover(&w, bottle, marker, "automatic").await;
        match &used(&d).selection {
            EngineSelection::Pinned {
                pin_id,
                reason,
                engine,
            } => {
                assert_eq!(pin_id, RETIRED_ID);
                assert_eq!(reason, "cx-inconclusive");
                assert_eq!(engine.wineserver_bin, paths.wineserver_bin);
                assert_eq!(engine.wine_bin, paths.wine_bin);
            }
            other => panic!("expected pinned, got {other:?}"),
        }
        assert_eq!(w.count("/wineserver"), 0);
    }
}

#[tokio::test]
async fn wr01_an_uninstalled_wine_manager_build_takes_the_crossover_branch_not_the_current_pin() {
    // The build is recorded in the marker but is not listed or installed.
    let w = timeout_world(Setup::default());
    let marker = w.summary(false, None, Some(WM), None);
    let d = busy_non_crossover(&w, BOTTLE, marker, "automatic").await;
    assert_eq!(d.engine_kind(), Some("crossover"));
    assert_eq!(d.reason(), Some("cx-inconclusive"));
}

#[tokio::test]
async fn wr01_a_pruned_retired_pin_takes_the_crossover_branch() {
    // The retired pin's files are gone.
    let w = timeout_world(Setup::default());
    let retired = retired_pin(&w.table.current);
    let paths = pinned_engine_paths(&w.ctx, &retired);
    let marker = w.summary(false, Some(RETIRED_ID), None, Some(paths.wineserver_bin));
    let d = busy_non_crossover(&w, BOTTLE, marker, "automatic").await;
    assert_eq!(d.engine_kind(), Some("crossover"));
    assert_eq!(d.reason(), Some("cx-inconclusive"));
}

#[tokio::test]
async fn wr01_forced_crossover_ignores_a_wine_manager_marker() {
    let w = timeout_world(Setup {
        wine_manager: true,
        ..Setup::default()
    });
    let marker = w.summary(false, None, Some(WM), None);
    let d = busy_non_crossover(&w, BOTTLE, marker, "crossover").await;
    assert_eq!(d.engine_kind(), Some("crossover"));
    assert_eq!(d.reason(), Some("override"));
}

#[tokio::test]
async fn a_pinned_inconclusive_with_the_pin_not_installed_needs_a_download() {
    let w = timeout_world(Setup {
        pin_installed: false,
        ..Setup::default()
    });
    let current = w.table.current.id.clone();
    let marker = w.summary(false, Some(&current), None, None);
    let d = busy_non_crossover(&w, BOTTLE, marker, "automatic").await;
    let u = used(&d);
    assert!(u.needs_download);
    assert_eq!(
        u.pin.as_ref().map(|p| p.id.as_str()),
        Some(current.as_str())
    );
}

// ---- regressions: a corroborated failure still falls back --------------------------------------------------

#[tokio::test]
async fn regression_nonzero_exit_twice_still_falls_back_as_cx_broken() {
    let w = world(Setup {
        probe: vec![Probe::NonZero, Probe::NonZero],
        ..Setup::default()
    });
    let d = w.decide(w.args(BOTTLE, "automatic")).await;
    assert_eq!(d.engine_kind(), Some("pinned"));
    assert_eq!(d.reason(), Some("cx-broken"));
}

#[tokio::test]
async fn regression_missing_crossover_still_falls_back_as_cx_missing() {
    let w = world(Setup {
        crossover: false,
        ..Setup::default()
    });
    let d = w.decide(w.args(BOTTLE, "automatic")).await;
    assert_eq!(d.engine_kind(), Some("pinned"));
    assert_eq!(d.reason(), Some("cx-missing"));
}

// ---- the marker is read, never written (the tracer's acceptance) -------------------------------------------

/// A real marker on disk, an inconclusive pre-flight on a busy bottle: the decision keeps the engine the
/// marker records, the marker's bytes and the whole profile are unchanged, no wineserver is stopped and
/// no toast is shown.
async fn marker_bytes_are_kept(fixture: &str, engine_kind: &str, reason: &str) {
    let w = timeout_world(Setup::default());
    w.profile.build_bottle_as(fixture, BOTTLE);
    w.busy(BOTTLE);
    let marker_before = w.profile.marker_sha(BOTTLE);
    assert_ne!(
        marker_before,
        serde_json::Value::Null,
        "{fixture} has a marker"
    );
    let tree_before = w.profile.snapshot();

    let marker = read_marker_summary(&w.ctx, BOTTLE);
    assert!(marker.is_some(), "{fixture}: the marker view reads");
    let d = w
        .decide(w.with_marker(w.args(BOTTLE, "automatic"), marker))
        .await;

    assert_eq!(d.engine_kind(), Some(engine_kind), "{fixture}");
    assert_eq!(d.reason(), Some(reason), "{fixture}");
    assert_eq!(
        w.profile.marker_sha(BOTTLE),
        marker_before,
        "{fixture}: marker bytes"
    );
    assert_eq!(
        w.profile.snapshot(),
        tree_before,
        "{fixture}: the tree is unchanged"
    );
    assert_eq!(w.count("/wineserver"), 0);
    assert!(w.logs().contains("outcome=timeout"), "{}", w.logs());
    assert_silent(&w);
}

#[tokio::test]
async fn an_inconclusive_pre_flight_keeps_a_pinned_marker_byte_for_byte() {
    marker_bytes_are_kept("fx-pinned-current", "pinned", "cx-inconclusive").await;
}

#[tokio::test]
async fn an_inconclusive_pre_flight_keeps_a_crossover_marker_byte_for_byte() {
    marker_bytes_are_kept("fx-crossover-marker", "crossover", "cx-inconclusive").await;
}

#[tokio::test]
async fn an_inconclusive_pre_flight_keeps_a_wine_manager_marker_byte_for_byte() {
    let w = timeout_world(Setup {
        wine_manager: true,
        ..Setup::default()
    });
    w.profile.build_bottle_as("fx-wine-manager", BOTTLE);
    w.busy(BOTTLE);
    let marker_before = w.profile.marker_sha(BOTTLE);
    let tree_before = w.profile.snapshot();
    let marker = read_marker_summary(&w.ctx, BOTTLE);
    let wm = marker.as_ref().and_then(|m| m.wine_manager_version.clone());
    assert!(wm.is_some(), "the fixture records a Wine Manager build");
    let d = w
        .decide(w.with_marker(w.args(BOTTLE, "automatic"), marker))
        .await;
    assert_eq!(wm.as_deref(), Some(WM));
    assert_eq!(d.engine_kind(), Some("wine-manager"));
    assert_eq!(d.reason(), Some("cx-inconclusive"));
    assert_eq!(w.profile.marker_sha(BOTTLE), marker_before);
    assert_eq!(w.profile.snapshot(), tree_before);
    assert_eq!(w.count("/wineserver"), 0);
    assert_silent(&w);
}
