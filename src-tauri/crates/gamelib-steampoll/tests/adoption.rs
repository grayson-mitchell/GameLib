//! Phase 81 D-07 / D-10 / D-14: the adoption-watch task under paused time. The evidence rules
//! (Steam's ACF rewrite everywhere, a changed steam_osx pid on macOS only), the singleton task
//! lifecycle and the watch-arg validation.

use gamelib_steampoll::adoption::{
    acf_rewritten_by_steam, validate_watch_args, AdoptionWatch, AdoptionWatchArgs,
    ADOPTION_POLL_KEY,
};
use gamelib_steampoll::constants::{
    ADOPTION_ACF_MAX_BYTES, ADOPTION_HELPER_SIGNED_IN_MIN_INTERVAL_MS, ADOPTION_TICK_MS,
};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::host::{BoxFuture, Notification, PollHost, RunOutput};
use gamelib_steampoll::outbox::Outbox;
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::registry::{PollKind, Registry};
use gamelib_steampoll::testing::{AckMode, FakeClock, RecordingHost, ScriptedRunner, StreamRecord};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const PGREP_MAC: &str = "/usr/bin/pgrep -x steam_osx";

/// A `PollHost` that forwards to a `RecordingHost` but names a bridge helper path, which the
/// recording host never does.
struct PathHost {
    inner: Arc<RecordingHost>,
    helper: Option<PathBuf>,
}

impl PollHost for PathHost {
    fn emit_frontend(&self, channel: &str, args: Vec<Value>) {
        self.inner.emit_frontend(channel, args);
    }
    fn notify(&self, n: Notification) {
        self.inner.notify(n);
    }
    fn state_event(&self, ev: StateEvent) -> BoxFuture<AckReply> {
        self.inner.state_event(ev)
    }
    fn bridge_helper_path(&self) -> Option<PathBuf> {
        self.helper.clone()
    }
    fn shell_pid(&self) -> u32 {
        1
    }
}

struct Rig {
    watch: AdoptionWatch,
    host: Arc<RecordingHost>,
    runner: Arc<ScriptedRunner>,
    registry: Registry,
    clock: Arc<FakeClock>,
    /// The helper path the host reports (a real empty file), `None` for a rig with no helper.
    helper: Option<String>,
    _helper_dir: Option<tempfile::TempDir>,
}

async fn rig(platform: Platform) -> Rig {
    rig_inner(platform, false).await
}

/// A rig whose host names an existing helper file, so `--steam-appstate` calls reach the runner.
async fn rig_with_helper(platform: Platform) -> Rig {
    rig_inner(platform, true).await
}

async fn rig_inner(platform: Platform, with_helper: bool) -> Rig {
    let host = Arc::new(RecordingHost::new(AckMode::Reply(AckReply {
        applied: true,
        ..AckReply::default()
    })));
    let runner = Arc::new(ScriptedRunner::default());
    let clock = Arc::new(FakeClock::new(1_000_000));
    let (helper_dir, helper_path) = if with_helper {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("steam-bridge-helper");
        std::fs::write(&path, "").unwrap();
        (Some(dir), Some(path))
    } else {
        (None, None)
    };
    let helper = helper_path
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned());
    let path_host = Arc::new(PathHost {
        inner: host.clone(),
        helper: helper_path,
    });
    let registry = Registry::new(
        tokio::runtime::Handle::current(),
        path_host as Arc<dyn PollHost>,
        runner.clone(),
        clock.clone(),
    );
    let outbox = Arc::new(Outbox::new());
    outbox.mark_ready(&*host).await;
    Rig {
        watch: AdoptionWatch::new(registry.clone(), outbox, platform, None),
        host,
        runner,
        registry,
        clock,
        helper,
        _helper_dir: helper_dir,
    }
}

impl Rig {
    fn active(&self) -> bool {
        self.registry
            .is_active(PollKind::Adoption, ADOPTION_POLL_KEY)
    }

    /// The `adoptionState` events the sidecar was sent, as (appId, adopted, signedIn).
    fn events(&self) -> Vec<(String, bool, Option<bool>)> {
        self.host
            .records()
            .into_iter()
            .filter_map(|r| match r {
                StreamRecord::State(StateEvent::AdoptionState {
                    app_id,
                    adopted,
                    signed_in,
                    ..
                }) => Some((app_id, adopted, signed_in)),
                _ => None,
            })
            .collect()
    }

    fn script_pgrep(&self, outputs: Vec<RunOutput>) {
        self.runner.on(PGREP_MAC, outputs);
    }

    fn helper_path(&self) -> &str {
        self.helper.as_deref().expect("rig built without a helper")
    }

    /// Scripts the `--steam-appstate` helper for `app_id`; lines are consumed in order, the last
    /// one repeats.
    fn script_helper(&self, app_id: &str, outputs: Vec<RunOutput>) {
        self.runner.on(
            &format!("{} --steam-appstate {app_id}", self.helper_path()),
            outputs,
        );
    }

    /// How many times the helper's `--steam-appstate` ran.
    fn helper_calls(&self) -> usize {
        self.runner
            .calls()
            .iter()
            .filter(|c| c.contains("--steam-appstate"))
            .count()
    }

    /// The `--steam-installapp` calls the watch made.
    fn install_app_calls(&self) -> Vec<String> {
        self.runner
            .calls()
            .into_iter()
            .filter(|c| c.contains("--steam-installapp"))
            .collect()
    }

    /// One adoption tick with the wall clock moving the same 5 s the paused timer does.
    async fn tick(&self) {
        self.clock.advance(ADOPTION_TICK_MS);
        tick().await;
    }
}

/// A helper answer line.
fn helper_ok(logged_on: u8, state: Option<u32>, installed: Option<u32>) -> RunOutput {
    let n = |v: Option<u32>| v.map_or("null".to_string(), |v| v.to_string());
    pgrep(
        Some(0),
        &format!(
            "{{\"result\":\"ok\",\"loggedOn\":{logged_on},\"state\":{},\"installed\":{}}}\n",
            n(state),
            n(installed)
        ),
    )
}

fn helper_unavailable(reason: &str) -> RunOutput {
    pgrep(
        Some(2),
        &format!("{{\"result\":\"unavailable\",\"reason\":\"{reason}\"}}\n"),
    )
}

async fn settle() {
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
}

/// Advance exactly one adoption tick and let the task run. The first settle lets a freshly
/// spawned task create its interval before the clock moves.
async fn tick() {
    settle().await;
    tokio::time::advance(Duration::from_millis(ADOPTION_TICK_MS)).await;
    settle().await;
}

/// An ACF in the text format GameLib writes.
fn acf(app_id: &str, state_flags: &str, buildid: &str) -> String {
    format!(
        "\"AppState\"\n{{\n\t\"appid\"\t\t\"{app_id}\"\n\t\"Universe\"\t\t\"1\"\n\t\"name\"\t\t\"Synthetic Game\"\n\t\"StateFlags\"\t\t\"{state_flags}\"\n\t\"installdir\"\t\t\"SyntheticGame\"\n\t\"buildid\"\t\t\"{buildid}\"\n}}\n"
    )
}

/// What GameLib writes at handoff: StateFlags 1026, no real build yet.
fn handoff_acf(app_id: &str) -> String {
    acf(app_id, "1026", "0")
}

/// What Steam rewrites it to once it adopts the install.
fn adopted_acf(app_id: &str) -> String {
    acf(app_id, "4", "9044149")
}

struct Library {
    _dir: tempfile::TempDir,
    steamapps: PathBuf,
}

fn library() -> Library {
    let dir = tempfile::tempdir().unwrap();
    let steamapps = dir.path().join("SteamLibrary").join("steamapps");
    std::fs::create_dir_all(&steamapps).unwrap();
    Library {
        _dir: dir,
        steamapps,
    }
}

impl Library {
    fn manifest(&self, app_id: &str) -> PathBuf {
        self.steamapps.join(format!("appmanifest_{app_id}.acf"))
    }

    fn write(&self, app_id: &str, content: &str) {
        std::fs::write(self.manifest(app_id), content).unwrap();
    }

    fn args(&self, app_id: &str, steam_pid: u32) -> AdoptionWatchArgs {
        AdoptionWatchArgs {
            app_id: app_id.to_string(),
            manifest_path: self.manifest(app_id).to_string_lossy().into_owned(),
            baseline_content: handoff_acf(app_id),
            recorded_at_ms: 1_700_000_000_000.0,
            steam_pid,
            install_app_fallback: false,
        }
    }
}

fn pgrep(code: Option<i32>, stdout: &str) -> RunOutput {
    RunOutput {
        code,
        stdout: stdout.to_string(),
        stderr: String::new(),
    }
}

// ---- lifecycle ----

#[tokio::test(start_paused = true)]
async fn watch_registers_the_entry_and_starts_the_task() {
    let r = rig(Platform::Linux).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    assert!(!r.active());
    r.watch.watch(lib.args("480", 0)).unwrap();
    assert!(r.active());
    assert_eq!(r.watch.watched_app_ids(), vec!["480".to_string()]);
    // Nothing is emitted before the first tick.
    assert!(r.events().is_empty());
}

#[tokio::test(start_paused = true)]
async fn a_steam_rewritten_acf_reads_adopted_emits_once_and_the_task_exits() {
    let r = rig(Platform::Linux).await;
    let lib = library();
    lib.write("480", &adopted_acf("480"));
    r.watch.watch(lib.args("480", 0)).unwrap();
    tick().await;
    assert_eq!(r.events(), vec![("480".to_string(), true, None)]);
    assert!(r.watch.watched_app_ids().is_empty());
    assert!(!r.active(), "the task exits when the last entry is adopted");
    // The event went out as a Transition with the seq the registry hands out.
    tick().await;
    assert_eq!(r.events().len(), 1);
}

#[tokio::test(start_paused = true)]
async fn an_unchanged_manifest_emits_not_adopted_once_then_stays_quiet() {
    let r = rig(Platform::Linux).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.watch.watch(lib.args("480", 0)).unwrap();
    tick().await;
    assert_eq!(r.events(), vec![("480".to_string(), false, None)]);
    tick().await;
    tick().await;
    assert_eq!(r.events().len(), 1, "dedupe on (adopted, signedIn)");
    assert!(r.active(), "the entry is kept");
    assert_eq!(r.watch.watched_app_ids(), vec!["480".to_string()]);
}

#[tokio::test(start_paused = true)]
async fn replacing_an_entry_resets_its_last_emitted_state() {
    let r = rig(Platform::Linux).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.watch.watch(lib.args("480", 0)).unwrap();
    tick().await;
    assert_eq!(r.events().len(), 1);
    r.watch.watch(lib.args("480", 0)).unwrap();
    tick().await;
    assert_eq!(r.events().len(), 2);
    assert_eq!(r.watch.watched_app_ids().len(), 1);
}

#[tokio::test(start_paused = true)]
async fn the_task_runs_until_the_last_entry_is_adopted() {
    let r = rig(Platform::Linux).await;
    let lib = library();
    lib.write("480", &adopted_acf("480"));
    lib.write("481", &handoff_acf("481"));
    r.watch.watch(lib.args("480", 0)).unwrap();
    r.watch.watch(lib.args("481", 0)).unwrap();
    assert_eq!(
        r.watch.watched_app_ids(),
        vec!["480".to_string(), "481".to_string()]
    );
    tick().await;
    assert!(r.events().contains(&("480".to_string(), true, None)));
    assert_eq!(r.watch.watched_app_ids(), vec!["481".to_string()]);
    assert!(r.active(), "one entry is still pending");
    lib.write("481", &adopted_acf("481"));
    tick().await;
    assert!(r.watch.watched_app_ids().is_empty());
    assert!(!r.active());
    // A later watch starts a fresh task.
    lib.write("482", &handoff_acf("482"));
    r.watch.watch(lib.args("482", 0)).unwrap();
    assert!(r.active());
}

#[tokio::test(start_paused = true)]
async fn unwatching_the_last_entry_stops_the_task_and_an_unknown_app_is_false() {
    let r = rig(Platform::Linux).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.watch.watch(lib.args("480", 0)).unwrap();
    assert!(!r.watch.unwatch("999"));
    assert!(r.active());
    assert!(r.watch.unwatch("480"));
    settle().await;
    assert!(!r.active());
    assert!(r.watch.watched_app_ids().is_empty());
    assert!(!r.watch.unwatch("480"));
}

// ---- evidence ----

#[tokio::test(start_paused = true)]
async fn a_gamelib_written_flags_4_acf_with_identical_content_is_never_adopted() {
    // The mtime trap: TS and Rust timestamps are not bit-equal, so only content can tell Steam's
    // rewrite from GameLib's own StateFlags 4 file.
    let r = rig(Platform::Darwin).await;
    let lib = library();
    let same = adopted_acf("480");
    lib.write("480", &same);
    let mut args = lib.args("480", 0);
    args.baseline_content = same.clone();
    assert!(!acf_rewritten_by_steam(&same, &same));
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    let reading = r.watch.read(&args).await;
    assert!(!reading.adopted);
    assert_eq!(reading.evidence, None);
}

#[tokio::test(start_paused = true)]
async fn a_placeholder_acf_is_not_adopted_even_when_its_content_differs() {
    let base = handoff_acf("480");
    assert!(!acf_rewritten_by_steam(&base, &acf("480", "2", "9044149")));
    assert!(!acf_rewritten_by_steam(&base, &acf("480", "18", "9044149")));
    assert!(!acf_rewritten_by_steam(&base, &acf("480", "4", "0")));
    assert!(!acf_rewritten_by_steam(&base, &acf("480", "4", "")));
    assert!(!acf_rewritten_by_steam(&base, "not an acf at all"));
    assert!(acf_rewritten_by_steam(&base, &adopted_acf("480")));
    // Bit 4 plus others still counts.
    assert!(acf_rewritten_by_steam(&base, &acf("480", "6", "1")));

    let r = rig(Platform::Linux).await;
    let lib = library();
    lib.write("480", &acf("480", "2", "9044149"));
    let reading = r.watch.read(&lib.args("480", 0)).await;
    assert!(!reading.adopted);
}

#[tokio::test(start_paused = true)]
async fn on_macos_a_recorded_pid_that_is_no_longer_live_reads_adopted() {
    let r = rig(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    let args = lib.args("480", 111);

    // Steam restarted: pgrep finds a different pid.
    r.script_pgrep(vec![pgrep(Some(0), "222\n")]);
    let reading = r.watch.read(&args).await;
    assert!(reading.adopted);
    assert_eq!(reading.evidence.as_deref(), Some("pid"));
    assert_eq!(reading.steam_running, Some(true));

    // Steam is not running at all (pgrep exit 1).
    r.script_pgrep(vec![pgrep(Some(1), "")]);
    let reading = r.watch.read(&args).await;
    assert!(reading.adopted);
    assert_eq!(reading.evidence.as_deref(), Some("pid"));
    assert_eq!(reading.steam_running, Some(false));

    // The same pid is still live: nothing changed.
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    assert!(!r.watch.read(&args).await.adopted);

    // No recorded pid: a pid is no evidence.
    r.script_pgrep(vec![pgrep(Some(0), "222\n")]);
    assert!(!r.watch.read(&lib.args("480", 0)).await.adopted);
}

#[tokio::test(start_paused = true)]
async fn on_macos_a_failing_pid_probe_is_not_adopted_and_keeps_the_entry() {
    let r = rig(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    // pgrep exit 2 is an error, `None` is a timeout.
    r.script_pgrep(vec![pgrep(Some(2), "")]);
    let reading = r.watch.read(&lib.args("480", 111)).await;
    assert!(!reading.adopted);
    assert_eq!(reading.steam_running, None);
    r.script_pgrep(vec![pgrep(None, "")]);
    assert!(!r.watch.read(&lib.args("480", 111)).await.adopted);

    // Through the task: the entry survives ticks while the probe cannot answer.
    r.watch.watch(lib.args("480", 111)).unwrap();
    tick().await;
    tick().await;
    assert_eq!(r.watch.watched_app_ids(), vec!["480".to_string()]);
    assert_eq!(r.events(), vec![("480".to_string(), false, None)]);
    assert!(r.active());
}

#[tokio::test(start_paused = true)]
async fn on_macos_the_task_adopts_on_a_pid_change_and_exits() {
    let r = rig(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.script_pgrep(vec![pgrep(Some(0), "111\n"), pgrep(Some(0), "222\n")]);
    r.watch.watch(lib.args("480", 111)).unwrap();
    tick().await;
    assert_eq!(r.events(), vec![("480".to_string(), false, None)]);
    tick().await;
    assert_eq!(
        r.events(),
        vec![
            ("480".to_string(), false, None),
            ("480".to_string(), true, None)
        ]
    );
    assert!(!r.active());
}

#[tokio::test(start_paused = true)]
async fn on_windows_and_linux_a_pid_change_alone_is_never_adopted() {
    // Spikes 087 and 088 (r4): a sign-out restarts Steam without adopting anything.
    let r = rig(Platform::Linux).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.runner.on("pgrep -x steam", vec![pgrep(Some(0), "222\n")]);
    let reading = r.watch.read(&lib.args("480", 111)).await;
    assert!(!reading.adopted);
    assert_eq!(reading.steam_running, Some(true));

    let w = rig(Platform::Win32).await;
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
    let tasklist = format!(
        "{}\\System32\\tasklist.exe",
        system_root.trim_end_matches('\\')
    );
    w.runner.on(
        &format!("{tasklist} /FI IMAGENAME eq steam.exe /FO CSV /NH"),
        vec![pgrep(
            Some(0),
            "\"steam.exe\",\"222\",\"Console\",\"1\",\"1 K\"\r\n",
        )],
    );
    let reading = w.watch.read(&lib.args("480", 111)).await;
    assert!(!reading.adopted);
    assert_eq!(reading.steam_running, Some(true));

    // Through the task on Linux: ticks never read it as adopted either.
    r.watch.watch(lib.args("480", 111)).unwrap();
    tick().await;
    tick().await;
    assert_eq!(r.events(), vec![("480".to_string(), false, None)]);
    assert!(r.active());
}

#[tokio::test(start_paused = true)]
async fn a_missing_or_unreadable_manifest_never_adopts_and_never_drops_the_entry() {
    let r = rig(Platform::Linux).await;
    let lib = library();
    // No file written at all.
    r.watch.watch(lib.args("480", 0)).unwrap();
    tick().await;
    tick().await;
    assert_eq!(r.events(), vec![("480".to_string(), false, None)]);
    assert_eq!(r.watch.watched_app_ids(), vec!["480".to_string()]);
    assert!(r.active());

    // A directory where the manifest should be is unreadable, not an error.
    std::fs::create_dir(lib.manifest("481")).unwrap();
    let reading = r.watch.read(&lib.args("481", 0)).await;
    assert!(!reading.adopted);

    // The manifest appears rewritten: the next tick adopts.
    lib.write("480", &adopted_acf("480"));
    tick().await;
    assert!(r.events().contains(&("480".to_string(), true, None)));
}

#[tokio::test(start_paused = true)]
async fn an_oversized_manifest_is_no_evidence() {
    let r = rig(Platform::Linux).await;
    let lib = library();
    let huge = format!(
        "{}\n{}",
        adopted_acf("480"),
        "#".repeat(ADOPTION_ACF_MAX_BYTES as usize + 1)
    );
    lib.write("480", &huge);
    assert!(!r.watch.read(&lib.args("480", 0)).await.adopted);
}

#[tokio::test(start_paused = true)]
async fn read_evaluates_without_registering_an_entry_or_starting_the_task() {
    let r = rig(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &adopted_acf("480"));
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    let reading = r.watch.read(&lib.args("480", 111)).await;
    assert!(reading.adopted);
    assert_eq!(reading.evidence.as_deref(), Some("acf"));
    assert_eq!(reading.steam_running, Some(true));
    assert!(r.watch.watched_app_ids().is_empty());
    assert!(!r.active());
    assert!(r.events().is_empty());
}

// ---- validation ----

#[tokio::test(start_paused = true)]
async fn validate_rejects_bad_watch_args_and_watch_refuses_them() {
    let lib = library();
    let good = lib.args("480", 0);
    assert!(validate_watch_args(&good).is_ok());

    let mut a = good.clone();
    a.app_id = "48x".into();
    assert!(validate_watch_args(&a).is_err());
    a.app_id = "12345678901".into();
    assert!(validate_watch_args(&a).is_err(), "11 digits");
    a.app_id = String::new();
    assert!(validate_watch_args(&a).is_err());

    let mut a = good.clone();
    a.manifest_path = "steamapps/appmanifest_480.acf".into();
    assert!(validate_watch_args(&a).is_err(), "relative path");

    let mut a = good.clone();
    a.manifest_path = lib
        .steamapps
        .join("appmanifest_481.acf")
        .to_string_lossy()
        .into_owned();
    assert!(
        validate_watch_args(&a).is_err(),
        "file name for another app"
    );

    let mut a = good.clone();
    a.manifest_path = lib
        .steamapps
        .join("notes.acf")
        .to_string_lossy()
        .into_owned();
    assert!(validate_watch_args(&a).is_err());

    let mut a = good.clone();
    let elsewhere: &Path = lib.steamapps.parent().unwrap();
    a.manifest_path = elsewhere
        .join("appmanifest_480.acf")
        .to_string_lossy()
        .into_owned();
    assert!(validate_watch_args(&a).is_err(), "parent is not steamapps");

    // The parent directory name is case-insensitive.
    let upper = lib.steamapps.parent().unwrap().join("SteamApps");
    let mut a = good.clone();
    a.manifest_path = upper
        .join("appmanifest_480.acf")
        .to_string_lossy()
        .into_owned();
    assert!(validate_watch_args(&a).is_ok());

    let mut a = good.clone();
    a.baseline_content = "x".repeat(ADOPTION_ACF_MAX_BYTES as usize + 1);
    assert!(validate_watch_args(&a).is_err());

    let mut a = good.clone();
    a.recorded_at_ms = f64::NAN;
    assert!(validate_watch_args(&a).is_err());
    a.recorded_at_ms = f64::INFINITY;
    assert!(validate_watch_args(&a).is_err());

    // watch refuses, registers nothing, starts nothing.
    let r = rig(Platform::Linux).await;
    let mut bad = good;
    bad.app_id = "nope".into();
    assert!(r.watch.watch(bad).is_err());
    assert!(r.watch.watched_app_ids().is_empty());
    assert!(!r.active());
}

#[test]
fn watch_args_deserialize_camel_case_and_reject_unknown_keys() {
    let ok: AdoptionWatchArgs = serde_json::from_str(
        r#"{"appId":"480","manifestPath":"/x/steamapps/appmanifest_480.acf","baselineContent":"b","recordedAtMs":1.5,"steamPid":7}"#,
    )
    .unwrap();
    assert_eq!(ok.steam_pid, 7);
    assert!(!ok.install_app_fallback);
    assert!(serde_json::from_str::<AdoptionWatchArgs>(
        r#"{"appId":"480","manifestPath":"/x","baselineContent":"b","recordedAtMs":1,"steamPid":7,"extra":1}"#
    )
    .is_err());
}

// ---- macOS helper reading (81-04, D-07 / D-08 / D-09 / D-10) ----

#[tokio::test(start_paused = true)]
async fn on_macos_helper_state_with_bit_4_reads_adopted_without_an_acf_or_pid_change() {
    let r = rig_with_helper(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    r.script_helper("480", vec![helper_ok(1, Some(4), Some(15))]);

    // read(): unchanged ACF, same pid, helper says 4.
    let reading = r.watch.read(&lib.args("480", 111)).await;
    assert!(reading.adopted);
    assert_eq!(reading.evidence.as_deref(), Some("helper"));
    assert_eq!(reading.helper_state, Some(4));
    assert_eq!(reading.signed_in, Some(true));

    // Through the task: adopted on the first tick, event carries signedIn, the entry goes.
    r.watch.watch(lib.args("480", 111)).unwrap();
    r.tick().await;
    assert_eq!(r.events(), vec![("480".to_string(), true, Some(true))]);
    assert!(r.watch.watched_app_ids().is_empty());
    assert!(!r.active());
    // Bit 4 plus other bits still counts.
    r.script_helper("480", vec![helper_ok(1, Some(6), None)]);
    assert!(r.watch.read(&lib.args("480", 111)).await.adopted);
}

#[tokio::test(start_paused = true)]
async fn on_macos_signing_in_adopts_by_itself_and_never_calls_install_app() {
    // The 112100 regression: Steam open at the sign-in screen, the operator signs in, same pid.
    let r = rig_with_helper(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    r.script_helper(
        "480",
        vec![
            helper_ok(0, Some(1), Some(0)),
            helper_ok(0, Some(1026), Some(15)),
            helper_ok(1, Some(4), Some(15)),
        ],
    );
    let mut args = lib.args("480", 111);
    args.install_app_fallback = true;
    r.watch.watch(args).unwrap();

    r.tick().await;
    assert_eq!(r.events(), vec![("480".to_string(), false, Some(false))]);
    r.tick().await;
    assert_eq!(r.events().len(), 1, "still (false, signed out): deduped");
    r.tick().await;
    assert_eq!(
        r.events(),
        vec![
            ("480".to_string(), false, Some(false)),
            ("480".to_string(), true, Some(true))
        ]
    );
    assert!(!r.active());
    assert!(
        r.install_app_calls().is_empty(),
        "sign-in adopts by itself: {:?}",
        r.install_app_calls()
    );
}

#[tokio::test(start_paused = true)]
async fn on_macos_install_app_fires_once_after_a_seen_sign_in_that_does_not_adopt() {
    let r = rig_with_helper(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    // Signed out, then signed in and stuck at 1026.
    r.script_helper(
        "480",
        vec![
            helper_ok(0, Some(1), Some(0)),
            helper_ok(1, Some(1026), Some(15)),
        ],
    );
    let key = format!(
        "{} --steam-installapp 480 --library {}",
        r.helper_path(),
        lib.steamapps.parent().unwrap().to_string_lossy()
    );
    r.runner.on(
        &key,
        vec![pgrep(Some(0), "{\"result\":\"ok\",\"folderIndex\":0}\n")],
    );
    let mut args = lib.args("480", 111);
    args.install_app_fallback = true;
    r.watch.watch(args).unwrap();

    r.tick().await; // signed out
    assert!(r.install_app_calls().is_empty());
    r.tick().await; // signed in, the window opens
    assert!(r.install_app_calls().is_empty());
    // Not yet: less than the delay has passed since the sign-in reading.
    r.tick().await; // +5 s
    assert!(r.install_app_calls().is_empty());
    r.tick().await; // +10 s: still not 4, fire
    assert_eq!(r.install_app_calls(), vec![key.clone()]);
    // Never again, however long it stays stuck.
    for _ in 0..6 {
        r.tick().await;
    }
    assert_eq!(r.install_app_calls(), vec![key]);
    assert!(r.active(), "the entry is kept");
}

#[tokio::test(start_paused = true)]
async fn on_macos_install_app_does_not_fire_when_adopted_before_the_delay() {
    let r = rig_with_helper(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    r.script_helper(
        "480",
        vec![
            helper_ok(0, Some(1), None),
            helper_ok(1, Some(1026), None),
            helper_ok(1, Some(4), None),
        ],
    );
    let mut args = lib.args("480", 111);
    args.install_app_fallback = true;
    r.watch.watch(args).unwrap();
    for _ in 0..5 {
        r.tick().await;
    }
    assert_eq!(
        r.events().last(),
        Some(&("480".to_string(), true, Some(true)))
    );
    assert!(r.install_app_calls().is_empty());
}

#[tokio::test(start_paused = true)]
async fn on_macos_install_app_never_fires_without_the_setting_or_without_a_seen_sign_out() {
    // Setting off: signed out, then signed in and stuck, never called.
    let off = rig_with_helper(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    off.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    off.script_helper(
        "480",
        vec![helper_ok(0, Some(1), None), helper_ok(1, Some(1026), None)],
    );
    off.watch.watch(lib.args("480", 111)).unwrap();
    for _ in 0..8 {
        off.tick().await;
    }
    assert!(off.install_app_calls().is_empty());

    // Setting on, but signed in from the first reading: no signed-out reading was ever seen.
    let on = rig_with_helper(Platform::Darwin).await;
    on.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    on.script_helper("480", vec![helper_ok(1, Some(1026), None)]);
    let mut args = lib.args("480", 111);
    args.install_app_fallback = true;
    on.watch.watch(args).unwrap();
    for _ in 0..8 {
        on.tick().await;
    }
    assert!(on.install_app_calls().is_empty());
    assert_eq!(on.events(), vec![("480".to_string(), false, Some(true))]);
}

#[tokio::test(start_paused = true)]
async fn on_macos_the_helper_refutes_a_pid_change_when_its_state_is_not_4() {
    let r = rig_with_helper(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    // The recorded pid 111 is gone: Steam restarted as 222.
    r.script_pgrep(vec![pgrep(Some(0), "222\n")]);
    r.script_helper("480", vec![helper_ok(1, Some(1), Some(3))]);
    let reading = r.watch.read(&lib.args("480", 111)).await;
    assert!(!reading.adopted, "state 1: restarted but not adopted");
    assert_eq!(reading.helper_state, Some(1));
    assert_eq!(reading.evidence, None);

    // Through the task as well.
    r.watch.watch(lib.args("480", 111)).unwrap();
    r.tick().await;
    r.tick().await;
    assert_eq!(r.events(), vec![("480".to_string(), false, Some(true))]);
    assert!(r.active());
}

#[tokio::test(start_paused = true)]
async fn on_macos_a_helper_with_no_answer_leaves_the_pid_rule_standing() {
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    let cases = [
        helper_unavailable("steam-not-running"),
        helper_unavailable("unsupported-arch"),
        pgrep(None, ""),
        pgrep(Some(0), "not json\n"),
        // Signed out answers with no state: nothing definite to refute with.
        helper_ok(0, None, None),
    ];
    for helper in cases {
        let r = rig_with_helper(Platform::Darwin).await;
        r.script_pgrep(vec![pgrep(Some(0), "222\n")]);
        r.script_helper("480", vec![helper.clone()]);
        let reading = r.watch.read(&lib.args("480", 111)).await;
        assert!(reading.adopted, "{helper:?}");
        assert_eq!(reading.evidence.as_deref(), Some("pid"), "{helper:?}");
    }
}

#[tokio::test(start_paused = true)]
async fn on_macos_an_unavailable_helper_never_adopts_reports_unknown_and_keeps_the_entry() {
    // D-10: a missing helper (no path), then one that fails every tick.
    let missing = rig(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    missing.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    missing.watch.watch(lib.args("480", 111)).unwrap();
    missing.tick().await;
    missing.tick().await;
    assert_eq!(missing.events(), vec![("480".to_string(), false, None)]);
    assert!(missing.active());

    let r = rig_with_helper(Platform::Darwin).await;
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    r.script_helper(
        "480",
        vec![helper_unavailable("method-unverified:BLoggedOn")],
    );
    r.watch.watch(lib.args("480", 111)).unwrap();
    for _ in 0..4 {
        r.tick().await;
    }
    assert_eq!(r.events(), vec![("480".to_string(), false, None)]);
    assert_eq!(r.watch.watched_app_ids(), vec!["480".to_string()]);
    assert!(r.active());
    assert_eq!(r.helper_calls(), 4, "unknown is probed every tick");
}

#[tokio::test(start_paused = true)]
async fn on_macos_the_helper_is_rate_limited_while_signed_in_and_unchanged() {
    let r = rig_with_helper(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    r.script_helper("480", vec![helper_ok(1, Some(1026), Some(3))]);
    r.watch.watch(lib.args("480", 0)).unwrap();

    let ticks_per_interval = ADOPTION_HELPER_SIGNED_IN_MIN_INTERVAL_MS / ADOPTION_TICK_MS;
    r.tick().await;
    assert_eq!(r.helper_calls(), 1, "the first tick asks");
    for _ in 1..ticks_per_interval {
        r.tick().await;
    }
    assert_eq!(r.helper_calls(), 1, "signed in and unchanged: reused");
    r.tick().await;
    assert_eq!(r.helper_calls(), 2, "one interval later: asked again");
    assert_eq!(r.events(), vec![("480".to_string(), false, Some(true))]);
}

#[tokio::test(start_paused = true)]
async fn on_macos_signed_out_is_probed_every_tick_and_a_pid_list_change_re_probes() {
    let signed_out = rig_with_helper(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    signed_out.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    signed_out.script_helper("480", vec![helper_ok(0, Some(1), None)]);
    signed_out.watch.watch(lib.args("480", 0)).unwrap();
    for _ in 0..3 {
        signed_out.tick().await;
    }
    assert_eq!(signed_out.helper_calls(), 3);

    let r = rig_with_helper(Platform::Darwin).await;
    // Ticks 1 and 2 see pid 111, tick 3 sees a restart (222), tick 4 stays on 222.
    r.script_pgrep(vec![
        pgrep(Some(0), "111\n"),
        pgrep(Some(0), "111\n"),
        pgrep(Some(0), "222\n"),
        pgrep(Some(0), "222\n"),
    ]);
    r.script_helper("480", vec![helper_ok(1, Some(1026), None)]);
    r.watch.watch(lib.args("480", 0)).unwrap();
    r.tick().await;
    r.tick().await;
    assert_eq!(r.helper_calls(), 1);
    r.tick().await;
    assert_eq!(r.helper_calls(), 2, "the pid list changed on this tick");
    r.tick().await;
    assert_eq!(r.helper_calls(), 2);
}

#[tokio::test(start_paused = true)]
async fn on_macos_read_always_asks_the_helper_once_and_returns_its_answer() {
    let r = rig_with_helper(Platform::Darwin).await;
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    r.script_pgrep(vec![pgrep(Some(0), "111\n")]);
    r.script_helper("480", vec![helper_ok(1, Some(1026), Some(9))]);
    let reading = r.watch.read(&lib.args("480", 111)).await;
    assert_eq!(r.helper_calls(), 1);
    assert!(!reading.adopted);
    assert_eq!(reading.helper_state, Some(1026));
    assert_eq!(reading.signed_in, Some(true));
    // A second read asks again (no entry, no cache) and never fires InstallApp.
    let mut args = lib.args("480", 111);
    args.install_app_fallback = true;
    r.script_helper("480", vec![helper_ok(0, Some(1), None)]);
    let reading = r.watch.read(&args).await;
    assert_eq!(r.helper_calls(), 2);
    assert_eq!(reading.signed_in, Some(false));
    assert_eq!(reading.helper_state, Some(1));
    assert!(r.install_app_calls().is_empty());
    assert!(r.watch.watched_app_ids().is_empty());
}

#[tokio::test(start_paused = true)]
async fn windows_and_linux_never_spawn_the_helper() {
    let lib = library();
    lib.write("480", &handoff_acf("480"));
    for platform in [Platform::Linux, Platform::Win32] {
        let r = rig_with_helper(platform).await;
        r.script_helper("480", vec![helper_ok(1, Some(4), Some(1))]);
        let mut args = lib.args("480", 111);
        args.install_app_fallback = true;
        let reading = r.watch.read(&args).await;
        assert!(!reading.adopted, "{platform:?}: helper state is not read");
        assert_eq!(reading.signed_in, None);
        assert_eq!(reading.helper_state, None);
        r.watch.watch(args).unwrap();
        for _ in 0..4 {
            r.tick().await;
        }
        assert_eq!(r.helper_calls(), 0, "{platform:?}");
        assert!(r.install_app_calls().is_empty(), "{platform:?}");
        assert!(
            r.runner
                .calls()
                .iter()
                .all(|c| !c.contains("steam-bridge-helper")),
            "{platform:?}"
        );
    }
}
