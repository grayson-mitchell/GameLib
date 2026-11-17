//! Phase 81 D-07 / D-10 / D-14: the adoption-watch task under paused time. The evidence rules
//! (Steam's ACF rewrite everywhere, a changed steam_osx pid on macOS only), the singleton task
//! lifecycle and the watch-arg validation.

use gamelib_steampoll::adoption::{
    acf_rewritten_by_steam, validate_watch_args, AdoptionWatch, AdoptionWatchArgs,
    ADOPTION_POLL_KEY,
};
use gamelib_steampoll::constants::{ADOPTION_ACF_MAX_BYTES, ADOPTION_TICK_MS};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::host::{PollHost, RunOutput};
use gamelib_steampoll::outbox::Outbox;
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::registry::{PollKind, Registry};
use gamelib_steampoll::testing::{AckMode, FakeClock, RecordingHost, ScriptedRunner, StreamRecord};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const PGREP_MAC: &str = "/usr/bin/pgrep -x steam_osx";

struct Rig {
    watch: AdoptionWatch,
    host: Arc<RecordingHost>,
    runner: Arc<ScriptedRunner>,
    registry: Registry,
}

async fn rig(platform: Platform) -> Rig {
    let host = Arc::new(RecordingHost::new(AckMode::Reply(AckReply {
        applied: true,
        ..AckReply::default()
    })));
    let runner = Arc::new(ScriptedRunner::default());
    let registry = Registry::new(
        tokio::runtime::Handle::current(),
        host.clone() as Arc<dyn PollHost>,
        runner.clone(),
        Arc::new(FakeClock::new(1_000_000)),
    );
    let outbox = Arc::new(Outbox::new());
    outbox.mark_ready(&*host).await;
    Rig {
        watch: AdoptionWatch::new(registry.clone(), outbox, platform, None),
        host,
        runner,
        registry,
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
