//! Cases from library.runningPoll.test.ts (probe dispatch, createRunningPoll, hold/release,
//! coexistence from the poller's side) under paused time with a scripted probe.

use gamelib_steampoll::constants::{RUNNING_DRAIN_MS, RUNNING_POLL_INTERVAL_MS};
use gamelib_steampoll::host::{PollHost, RunOutput};
use gamelib_steampoll::profile::Platform;
use gamelib_steampoll::registry::{PollKind, Registry};
use gamelib_steampoll::running::{read_running_app_id, Probe, RunningPoll};
use gamelib_steampoll::testing::{AckMode, FakeClock, RecordingHost, ScriptedRunner, StreamRecord};
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Notify;

struct Rig {
    poll: RunningPoll,
    host: Arc<RecordingHost>,
    clock: Arc<FakeClock>,
    registry: Registry,
    current: Arc<AtomicU32>,
}

fn rig() -> Rig {
    let host = Arc::new(RecordingHost::new(AckMode::NotReady));
    let clock = Arc::new(FakeClock::new(1_000_000));
    let runner = Arc::new(ScriptedRunner::default());
    let registry = Registry::new(
        tokio::runtime::Handle::current(),
        host.clone() as Arc<dyn PollHost>,
        runner,
        clock.clone(),
    );
    let current = Arc::new(AtomicU32::new(0));
    let c = current.clone();
    let probe: Probe = Arc::new(move || {
        let v = c.load(Ordering::SeqCst);
        Box::pin(async move { v })
    });
    Rig {
        poll: RunningPoll::new(registry.clone(), probe),
        host,
        clock,
        registry,
        current,
    }
}

impl Rig {
    async fn read(&self, id: u32) {
        self.current.store(id, Ordering::SeqCst);
        self.poll.poll_once().await;
    }
    /// The (appName, status) pairs sent, in order.
    fn sent(&self) -> Vec<(String, String)> {
        self.host
            .records()
            .into_iter()
            .filter_map(|r| match r {
                StreamRecord::Frontend { channel, args } => {
                    assert_eq!(channel, "gameStatusUpdate");
                    assert_eq!(args[0]["runner"], "steam");
                    Some((
                        args[0]["appName"].as_str().unwrap().to_string(),
                        args[0]["status"].as_str().unwrap().to_string(),
                    ))
                }
                _ => None,
            })
            .collect()
    }
}

fn s(a: &str, b: &str) -> (String, String) {
    (a.to_string(), b.to_string())
}

async fn settle() {
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
}

// ---- probe dispatch (readRunningAppId) ----

fn reg_vdf(app: &str) -> String {
    format!("\"Registry\"\n{{\n\t\"HKCU\"\n\t{{\n\t\t\"Software\"\n\t\t{{\n\t\t\t\"Valve\"\n\t\t\t{{\n\t\t\t\t\"Steam\"\n\t\t\t\t{{\n\t\t\t\t\t\"RunningAppID\"\t\t\"{app}\"\n\t\t\t\t}}\n\t\t\t}}\n\t\t}}\n\t}}\n}}\n")
}

#[tokio::test]
async fn win32_reads_natively_and_spawns_nothing() {
    let runner = ScriptedRunner::default();
    let v = read_running_app_id(Platform::Win32, Path::new(""), None, &runner, false).await;
    // Off Windows the native reader is the Ok(None) arm, which reads 0; the real registry is
    // covered by the steamfiles cfg(windows) test.
    if !cfg!(windows) {
        assert_eq!(v, Ok(0));
    }
    assert!(runner.calls().is_empty());
}

#[tokio::test]
async fn darwin_parses_registry_vdf_and_makes_no_runner_call() {
    let home = tempfile::tempdir().unwrap();
    let dir = home.path().join("Library/Application Support/Steam");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("registry.vdf"), reg_vdf("7000")).unwrap();
    let runner = ScriptedRunner::default();
    let v = read_running_app_id(Platform::Darwin, home.path(), None, &runner, false).await;
    assert_eq!(v, Ok(7000));
    assert!(runner.calls().is_empty());
}

#[tokio::test]
async fn darwin_is_zero_for_absent_unparsable_or_keyless_registry() {
    let home = tempfile::tempdir().unwrap();
    let runner = ScriptedRunner::default();
    assert_eq!(
        read_running_app_id(Platform::Darwin, home.path(), None, &runner, false).await,
        Ok(0)
    );
    let dir = home.path().join("Library/Application Support/Steam");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("registry.vdf"), "not vdf {{{").unwrap();
    assert_eq!(
        read_running_app_id(Platform::Darwin, home.path(), None, &runner, false).await,
        Ok(0)
    );
    std::fs::write(dir.join("registry.vdf"), "\"Registry\"\n{\n}\n").unwrap();
    assert_eq!(
        read_running_app_id(Platform::Darwin, home.path(), None, &runner, false).await,
        Ok(0)
    );
}

#[tokio::test]
async fn linux_returns_the_vdf_value_without_spawning() {
    let home = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(home.path().join(".steam")).unwrap();
    std::fs::write(home.path().join(".steam/registry.vdf"), reg_vdf("1245620")).unwrap();
    let runner = ScriptedRunner::default();
    let v = read_running_app_id(Platform::Linux, home.path(), None, &runner, false).await;
    assert_eq!(v, Ok(1245620));
    assert!(runner.calls().is_empty());
}

fn ps_out(code: Option<i32>, stdout: &str) -> RunOutput {
    RunOutput {
        code,
        stdout: stdout.to_string(),
        stderr: String::new(),
    }
}

#[tokio::test]
async fn linux_falls_back_to_the_reaper_scan_only_when_the_vdf_is_zero() {
    let home = tempfile::tempdir().unwrap();
    let runner = ScriptedRunner::default();
    runner.on(
        "ps -eo args",
        vec![ps_out(
            Some(0),
            "/sbin/init\nreaper SteamLaunch --AppId 431960 -- foo\n",
        )],
    );
    let v = read_running_app_id(Platform::Linux, home.path(), None, &runner, false).await;
    assert_eq!(v, Ok(431960));
    assert_eq!(runner.calls(), vec!["ps -eo args".to_string()]);
}

#[tokio::test]
async fn linux_reaper_scan_is_zero_on_no_match_timeout_or_nonzero_exit() {
    let home = tempfile::tempdir().unwrap();
    for out in [
        ps_out(Some(0), "bash\nvim\n"),
        ps_out(None, "reaper SteamLaunch --AppId 5"),
        ps_out(Some(1), "reaper SteamLaunch --AppId 5"),
    ] {
        let runner = ScriptedRunner::default();
        runner.on("ps -eo args", vec![out]);
        let v = read_running_app_id(Platform::Linux, home.path(), None, &runner, false).await;
        assert_eq!(v, Ok(0));
    }
}

#[tokio::test]
async fn strict_propagates_an_unattemptable_read_and_matches_non_strict_otherwise() {
    let runner = ScriptedRunner::default();
    for p in [Platform::Darwin, Platform::Linux] {
        assert!(read_running_app_id(p, Path::new(""), None, &runner, true)
            .await
            .is_err());
        assert_eq!(
            read_running_app_id(p, Path::new(""), None, &runner, false).await,
            Ok(0)
        );
    }
    let home = tempfile::tempdir().unwrap();
    let dir = home.path().join("Library/Application Support/Steam");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("registry.vdf"), reg_vdf("9")).unwrap();
    assert_eq!(
        read_running_app_id(Platform::Darwin, home.path(), None, &runner, true).await,
        Ok(9)
    );
}

// ---- createRunningPoll ----

#[tokio::test]
async fn playing_when_zero_to_x_and_no_done_without_a_prior_game() {
    let r = rig();
    r.read(7000).await;
    assert_eq!(r.sent(), vec![s("7000", "playing")]);
    assert_eq!(r.poll.last_app_id(), 7000);
}

#[tokio::test]
async fn done_when_x_to_zero() {
    let r = rig();
    r.read(7000).await;
    r.read(0).await;
    assert_eq!(r.sent(), vec![s("7000", "playing"), s("7000", "done")]);
}

#[tokio::test]
async fn nothing_when_unchanged() {
    let r = rig();
    r.read(0).await;
    r.read(7000).await;
    r.read(7000).await;
    assert_eq!(r.sent(), vec![s("7000", "playing")]);
}

#[tokio::test]
async fn done_for_the_old_id_then_playing_for_the_new_on_x_to_y() {
    let r = rig();
    r.read(1).await;
    r.read(2).await;
    assert_eq!(
        r.sent(),
        vec![s("1", "playing"), s("1", "done"), s("2", "playing")]
    );
}

#[tokio::test(start_paused = true)]
async fn start_is_idempotent_one_task_and_stop_resets_last_id() {
    let r = rig();
    r.current.store(7000, Ordering::SeqCst);
    r.poll.start();
    r.poll.start();
    settle().await;
    assert!(r.registry.is_active(PollKind::Running, "running"));
    tokio::time::advance(Duration::from_millis(RUNNING_POLL_INTERVAL_MS)).await;
    settle().await;
    assert_eq!(r.sent(), vec![s("7000", "playing")]);
    assert_eq!(r.poll.last_app_id(), 7000);
    r.poll.stop();
    assert_eq!(r.poll.last_app_id(), 0);
    settle().await;
    assert!(!r.registry.is_active(PollKind::Running, "running"));
    // Stopped: later ticks send nothing.
    tokio::time::advance(Duration::from_millis(RUNNING_POLL_INTERVAL_MS * 3)).await;
    settle().await;
    assert_eq!(r.sent().len(), 1);
    // And it can start again.
    r.poll.start();
    settle().await;
    tokio::time::advance(Duration::from_millis(RUNNING_POLL_INTERVAL_MS)).await;
    settle().await;
    assert_eq!(r.sent().len(), 2);
}

/// 80-REVIEW A/WR-07: a stop then start before the old task sees its cancellation must not let
/// that dying task clear `started`, or the next start spawns a second, unreachable poller.
#[tokio::test(start_paused = true)]
async fn a_dying_task_after_stop_then_start_cannot_enable_a_duplicate_poller() {
    let host = Arc::new(RecordingHost::new(AckMode::NotReady));
    let registry = Registry::new(
        tokio::runtime::Handle::current(),
        host.clone() as Arc<dyn PollHost>,
        Arc::new(ScriptedRunner::default()),
        Arc::new(FakeClock::new(0)),
    );
    let calls = Arc::new(AtomicU32::new(0));
    let c = calls.clone();
    let probe: Probe = Arc::new(move || {
        c.fetch_add(1, Ordering::SeqCst);
        Box::pin(async move { 0 })
    });
    let poll = RunningPoll::new(registry, probe);
    poll.start();
    settle().await;
    // No await between: the first task has not observed its cancellation yet.
    poll.stop();
    poll.start();
    settle().await;
    // Already running: this must be a no-op.
    poll.start();
    settle().await;
    tokio::time::advance(Duration::from_millis(RUNNING_POLL_INTERVAL_MS)).await;
    settle().await;
    assert_eq!(
        calls.load(Ordering::SeqCst),
        1,
        "one tick must probe once; more means duplicate pollers"
    );
    poll.stop();
}

#[tokio::test(start_paused = true)]
async fn the_interval_is_five_seconds_and_does_not_fire_at_start() {
    let r = rig();
    r.current.store(5, Ordering::SeqCst);
    r.poll.start();
    settle().await;
    assert!(r.sent().is_empty());
    tokio::time::advance(Duration::from_millis(RUNNING_POLL_INTERVAL_MS - 1)).await;
    settle().await;
    assert!(r.sent().is_empty());
    tokio::time::advance(Duration::from_millis(1)).await;
    settle().await;
    assert_eq!(r.sent(), vec![s("5", "playing")]);
}

#[tokio::test(start_paused = true)]
async fn a_tick_while_the_probe_is_pending_is_skipped() {
    let host = Arc::new(RecordingHost::new(AckMode::NotReady));
    let registry = Registry::new(
        tokio::runtime::Handle::current(),
        host.clone() as Arc<dyn PollHost>,
        Arc::new(ScriptedRunner::default()),
        Arc::new(FakeClock::new(0)),
    );
    let gate = Arc::new(Notify::new());
    let calls = Arc::new(AtomicU32::new(0));
    let (g, c) = (gate.clone(), calls.clone());
    let probe: Probe = Arc::new(move || {
        let (g, c) = (g.clone(), c.clone());
        Box::pin(async move {
            c.fetch_add(1, Ordering::SeqCst);
            g.notified().await;
            9
        })
    });
    let poll = RunningPoll::new(registry, probe);
    let first = {
        let p = poll.clone();
        tokio::spawn(async move { p.poll_once().await })
    };
    settle().await;
    poll.poll_once().await; // skipped, returns at once
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    gate.notify_one();
    first.await.unwrap();
    assert_eq!(poll.last_app_id(), 9);
    // The guard resets: a later poll probes again.
    gate.notify_one();
    poll.poll_once().await;
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

// ---- hold / release (quick 261111-a9g) ----

#[tokio::test]
async fn h1_hold_sends_nothing_while_held_and_last_id_still_tracks() {
    let r = rig();
    let _claim = r.poll.hold(7);
    r.read(7).await;
    assert_eq!(r.poll.last_app_id(), 7);
    r.read(0).await;
    assert!(r.sent().is_empty());
}

#[tokio::test]
async fn h2_release_true_after_the_poller_saw_x_is_silent_then_playing_again() {
    let r = rig();
    let claim = r.poll.hold(7);
    r.read(7).await;
    r.poll.release(claim, true);
    r.read(0).await;
    assert!(r.sent().is_empty());
    r.read(7).await;
    assert_eq!(r.sent(), vec![s("7", "playing")]);
}

#[tokio::test]
async fn h3_release_true_before_the_poller_saw_x_lagging_reads_are_silent() {
    let r = rig();
    let claim = r.poll.hold(7);
    r.poll.release(claim, true);
    r.read(7).await;
    r.read(0).await;
    assert!(r.sent().is_empty());
}

#[tokio::test]
async fn h4_drain_deadline_sends_one_playing_then_done_at_x_to_zero() {
    let r = rig();
    let claim = r.poll.hold(7);
    r.read(7).await;
    r.poll.release(claim, true);
    r.clock.advance(RUNNING_DRAIN_MS - 1);
    r.read(7).await;
    assert!(r.sent().is_empty());
    r.clock.advance(1);
    r.read(7).await;
    assert_eq!(r.sent(), vec![s("7", "playing")]);
    r.read(7).await;
    assert_eq!(r.sent().len(), 1);
    r.read(0).await;
    assert_eq!(r.sent(), vec![s("7", "playing"), s("7", "done")]);
}

#[tokio::test]
async fn h5_release_false_sends_playing_now_when_the_poller_already_reads_x() {
    let r = rig();
    let claim = r.poll.hold(7);
    r.read(7).await;
    r.poll.release(claim, false);
    assert_eq!(r.sent(), vec![s("7", "playing")]);
    // A second release is a no-op.
    r.poll.release(claim, false);
    assert_eq!(r.sent().len(), 1);

    let r = rig();
    let claim = r.poll.hold(7);
    r.poll.release(claim, false);
    assert!(r.sent().is_empty());
    r.read(7).await;
    assert_eq!(r.sent(), vec![s("7", "playing")]);
}

#[tokio::test]
async fn h6_a_second_hold_replaces_the_claim_and_a_stale_release_is_a_noop() {
    let r = rig();
    let stale = r.poll.hold(7);
    let fresh = r.poll.hold(7);
    r.read(7).await;
    r.poll.release(stale, false);
    assert!(
        r.sent().is_empty(),
        "the stale release must not drop the new claim"
    );
    r.read(0).await;
    assert!(r.sent().is_empty());
    r.poll.release(fresh, false);
    // stop() clears claims
    let r = rig();
    let _c = r.poll.hold(7);
    r.poll.stop();
    r.read(7).await;
    assert_eq!(r.sent(), vec![s("7", "playing")]);
}

#[tokio::test]
async fn release_true_twice_does_not_extend_the_drain() {
    let r = rig();
    let claim = r.poll.hold(7);
    r.read(7).await;
    r.poll.release(claim, true);
    r.clock.advance(RUNNING_DRAIN_MS - 1000);
    r.poll.release(claim, true);
    r.clock.advance(1000);
    r.read(7).await;
    assert_eq!(r.sent(), vec![s("7", "playing")]);
}

// ---- coexistence, the poller's side (C1, C2, C7) ----

#[tokio::test]
async fn c1_poller_first_one_playing_and_one_done_for_a_launch() {
    let r = rig();
    r.read(0).await;
    r.read(7).await;
    r.read(7).await;
    r.read(0).await;
    r.read(0).await;
    assert_eq!(r.sent(), vec![s("7", "playing"), s("7", "done")]);
}

#[tokio::test]
async fn c2_watch_first_the_watch_owns_the_frames_and_the_poller_adds_none() {
    // The watch (TS) sends its own playing/done; the claim keeps the poller out of the way.
    let r = rig();
    let claim = r.poll.hold(7);
    r.read(7).await;
    r.read(0).await;
    r.poll.release(claim, true);
    r.read(0).await;
    assert!(r.sent().is_empty());
}

#[tokio::test]
async fn c7_self_heal_a_premature_watch_done_is_repaired_after_the_drain() {
    let r = rig();
    let claim = r.poll.hold(7);
    r.read(7).await;
    r.poll.release(claim, true); // the watch sent a (premature) done
    r.clock.advance(RUNNING_DRAIN_MS);
    r.read(7).await;
    assert_eq!(r.sent(), vec![s("7", "playing")]);
}
