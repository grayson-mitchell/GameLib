//! Port of the rearm half of `library.resume.test.ts` (the `init() re-arm` describe). The
//! user-triggered `resumeInterruptedSteamInstall` cases and the persist/clear cases (poll-side,
//! covered by tests/install_loop.rs and tests/hold.rs) are not part of this plan. Mapping table
//! is in 80-16-SUMMARY.md.

use gamelib_steamfiles::acf::{write_app_manifest, AppManifestParams};
use gamelib_steampoll::events::StateEvent;
use gamelib_steampoll::hold::{HoldStore, PidToken, RestartHoldRecord};
use gamelib_steampoll::host::{BoxFuture, HoldSink, ProcessRunner, RunOutput, StreamingChild};
use gamelib_steampoll::install_loop::InstallPolls;
use gamelib_steampoll::monitor::DownloadMonitor;
use gamelib_steampoll::outbox::Outbox;
use gamelib_steampoll::profile::{Platform, SidecarProfile};
use gamelib_steampoll::rearm::{rearm_persisted_holds, RearmOutcome};
use gamelib_steampoll::registry::{PollKind, Registry};
use gamelib_steampoll::testing::{AckMode, FakeClock, RecordingHost, ScriptedRunner, StreamRecord};
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;
use tokio::sync::Notify;

const APP: &str = "730";
const NOW: u64 = 1_000_000_000;

struct Gated {
    inner: Arc<ScriptedRunner>,
    gate: Arc<Notify>,
    gated: bool,
}

impl ProcessRunner for Gated {
    fn run(&self, program: &str, argv: Vec<String>, t: Duration) -> BoxFuture<RunOutput> {
        let inner = self.inner.clone();
        let gate = self.gate.clone();
        let gated = self.gated;
        let program = program.to_string();
        Box::pin(async move {
            if gated {
                gate.notified().await;
            }
            inner.run(&program, argv, t).await
        })
    }
    fn spawn_streaming(&self, p: &str, a: Vec<String>) -> std::io::Result<StreamingChild> {
        self.inner.spawn_streaming(p, a)
    }
}

struct Rig {
    polls: InstallPolls,
    reg: Registry,
    host: Arc<RecordingHost>,
    runner: Arc<ScriptedRunner>,
    gate: Arc<Notify>,
    outbox: Arc<Outbox>,
    profile: SidecarProfile,
    store: HoldStore,
    steamapps: std::path::PathBuf,
    _tmp: TempDir,
}

async fn rig(gated: bool, ready: bool) -> Rig {
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
    let user_data = tmp.path().join("ud");
    std::fs::create_dir_all(user_data.join("store_cache")).unwrap();
    std::fs::write(
        user_data.join("config.json"),
        serde_json::json!({"defaultSettings": {"defaultSteamPath": steam.to_string_lossy()}})
            .to_string(),
    )
    .unwrap();
    let profile = SidecarProfile {
        user_data: user_data.to_string_lossy().into_owned(),
        config_path: user_data.join("config.json").to_string_lossy().into_owned(),
        restart_hold_store_path: user_data
            .join("store_cache")
            .join("steam_restart_hold.json")
            .to_string_lossy()
            .into_owned(),
        locales_dir: None,
    };
    let host = Arc::new(RecordingHost::new(AckMode::Reply(
        gamelib_steampoll::events::AckReply {
            applied: true,
            ..Default::default()
        },
    )));
    let scripted = Arc::new(ScriptedRunner::default());
    let gate = Arc::new(Notify::new());
    let runner: Arc<dyn ProcessRunner> = Arc::new(Gated {
        inner: scripted.clone(),
        gate: gate.clone(),
        gated,
    });
    let clock = Arc::new(FakeClock::new(NOW));
    let outbox = Arc::new(Outbox::new());
    if ready {
        outbox.mark_ready(host.as_ref()).await;
    }
    let reg = Registry::new(
        tokio::runtime::Handle::current(),
        host.clone(),
        runner.clone(),
        clock.clone(),
    );
    let monitor = Arc::new(DownloadMonitor::with_platform(
        host.clone(),
        runner,
        clock,
        false,
    ));
    let hold: Arc<dyn HoldSink> = host.clone();
    let polls = InstallPolls::new(reg.clone(), outbox.clone(), hold, monitor, Platform::Linux);
    let store = HoldStore::new(&profile.restart_hold_store_path);
    Rig {
        polls,
        reg,
        host,
        runner: scripted,
        gate,
        outbox,
        profile,
        store,
        steamapps,
        _tmp: tmp,
    }
}

fn record(recorded_at: f64) -> RestartHoldRecord {
    RestartHoldRecord {
        pids: vec![PidToken {
            pid: 111,
            start_token: "T1".into(),
        }],
        recorded_at,
        mac_native_route: true,
        skipped_depots: vec!["5".into()],
    }
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

fn write_manifest(r: &Rig, flags: &str) {
    write_app_manifest(&r.steamapps, &manifest(flags), 1).unwrap();
}

fn out(code: i32, stdout: &str) -> RunOutput {
    RunOutput {
        code: Some(code),
        stdout: stdout.into(),
        stderr: String::new(),
    }
}

fn script_live(r: &Rig, token: &str) {
    r.runner.on("pgrep -x steam", vec![out(0, "111\n")]);
    r.runner.on(
        "ps -o pid=,lstart= -p 111",
        vec![out(0, &format!("111 {token}\n"))],
    );
}

fn not_started(r: &Rig) -> bool {
    !r.reg.is_active(PollKind::Install, APP) && r.polls.snapshot_poll(APP).is_none()
}

#[tokio::test(start_paused = true)]
async fn re_arms_for_the_same_steam_process_with_the_restored_hold() {
    let r = rig(false, true).await;
    write_manifest(&r, "4");
    // recorded 9 s ago => startTicks 3
    r.store.record(APP, &record((NOW - 9_000) as f64), NOW);
    script_live(&r, "T1");
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(
        o,
        RearmOutcome {
            dropped: 0,
            armed: 1
        }
    );
    let poll = r.polls.snapshot_poll(APP).expect("poll started");
    assert_eq!(
        poll.hold.steam_hold,
        gamelib_steampoll::hold::HoldState::Holding
    );
    assert_eq!(poll.hold.steam_pids_at_handoff, vec![111]);
    assert!(poll.hold.is_native_handoff);
    assert!(poll.hold.mac_native_route);
    assert_eq!(poll.hold.skipped_depots, vec!["5".to_string()]);
    assert_eq!(poll.ticks, 3);
    assert!(poll.notified_waiting, "no re-toast");
    assert_eq!(poll.title, "", "the first ack refreshes the title (R2)");
    assert!(r.store.read(APP).is_some(), "record kept");
    assert!(r.polls.holding_app_ids().contains(&APP.to_string()));
}

#[tokio::test(start_paused = true)]
async fn drops_on_a_differing_start_token_pid_reuse() {
    let r = rig(false, true).await;
    write_manifest(&r, "4");
    r.store.record(APP, &record(NOW as f64), NOW);
    script_live(&r, "T2");
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o.dropped, 1);
    assert!(r.store.read(APP).is_none());
    assert!(not_started(&r));
}

#[tokio::test(start_paused = true)]
async fn drops_when_steam_is_not_running() {
    let r = rig(false, true).await;
    write_manifest(&r, "4");
    r.store.record(APP, &record(NOW as f64), NOW);
    r.runner.on("pgrep -x steam", vec![out(1, "")]);
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o.dropped, 1);
    assert!(r.store.read(APP).is_none());
    assert!(not_started(&r));
}

#[tokio::test(start_paused = true)]
async fn drops_a_record_older_than_the_safety_cap() {
    let r = rig(false, true).await;
    write_manifest(&r, "4");
    let max_age = 7200.0 * 3000.0;
    r.store
        .record(APP, &record(NOW as f64 - max_age - 1.0), NOW);
    script_live(&r, "T1");
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o.dropped, 1);
    assert!(r.store.read(APP).is_none());
    assert!(not_started(&r));
}

#[tokio::test(start_paused = true)]
async fn drops_when_the_native_manifest_is_downloading() {
    let r = rig(false, true).await;
    write_manifest(&r, "1042");
    r.store.record(APP, &record(NOW as f64), NOW);
    script_live(&r, "T1");
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o.dropped, 1);
    assert!(r.store.read(APP).is_none());
    assert!(not_started(&r));
}

#[tokio::test(start_paused = true)]
async fn drops_when_the_native_manifest_is_absent() {
    let r = rig(false, true).await;
    r.store.record(APP, &record(NOW as f64), NOW);
    script_live(&r, "T1");
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o.dropped, 1);
    assert!(r.store.read(APP).is_none());
    assert!(not_started(&r));
}

#[tokio::test(start_paused = true)]
async fn keeps_the_record_when_the_manifest_state_is_unknown() {
    let r = rig(false, true).await;
    // libraryfolders.vdf exists but is unreadable as a file (a directory): strict read fails.
    std::fs::remove_file(r.steamapps.join("libraryfolders.vdf")).unwrap();
    std::fs::create_dir(r.steamapps.join("libraryfolders.vdf")).unwrap();
    r.store.record(APP, &record(NOW as f64), NOW);
    script_live(&r, "T1");
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o, RearmOutcome::default());
    assert!(r.store.read(APP).is_some());
    assert!(not_started(&r));
}

#[tokio::test(start_paused = true)]
async fn drops_when_a_native_install_is_already_in_flight() {
    let r = rig(false, true).await;
    write_manifest(&r, "4");
    r.store.record(APP, &record(NOW as f64), NOW);
    script_live(&r, "T1");
    r.polls.set_native_in_flight(APP, true);
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o.dropped, 1);
    assert!(r.store.read(APP).is_none());
    assert!(not_started(&r));
}

#[tokio::test(start_paused = true)]
async fn drops_when_an_install_poll_is_already_active() {
    let r = rig(false, true).await;
    write_manifest(&r, "4");
    r.store.record(APP, &record(NOW as f64), NOW);
    script_live(&r, "T1");
    let (_t, _g) = r.reg.register(PollKind::Install, APP);
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o.dropped, 1);
    assert!(r.store.read(APP).is_none());
    assert_eq!(o.armed, 0);
}

#[tokio::test(start_paused = true)]
async fn an_inconclusive_probe_arms_nothing_and_keeps_the_record() {
    let r = rig(false, true).await;
    write_manifest(&r, "4");
    r.store.record(APP, &record(NOW as f64), NOW);
    r.runner.on("pgrep -x steam", vec![out(2, "")]);
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o.armed, 0);
    assert_eq!(o.dropped, 1, "counts as released (fail-open)");
    assert!(r.store.read(APP).is_some());
    assert!(not_started(&r));
}

#[tokio::test(start_paused = true)]
async fn zero_records_spawn_no_probe_at_all() {
    let r = rig(false, true).await;
    let o = rearm_persisted_holds(&r.polls, &r.profile).await;
    assert_eq!(o, RearmOutcome::default());
    assert!(r.runner.calls().is_empty(), "no ProcessRunner call");
}

#[tokio::test(start_paused = true)]
async fn fails_closed_while_pending_then_sends_rearm_settled_once_on_drop() {
    let r = rig(true, true).await;
    write_manifest(&r, "4");
    r.store.record(APP, &record(NOW as f64), NOW);
    r.runner.on("pgrep -x steam", vec![out(1, "")]); // Steam is gone -> drop

    let polls = r.polls.clone();
    let profile = r.profile.clone();
    let task = tokio::spawn(async move { rearm_persisted_holds(&polls, &profile).await });
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
    // A status query during the rearm sees the app as holding (fail closed).
    assert_eq!(r.polls.holding_app_ids(), vec![APP.to_string()]);
    assert!(r.polls.reconcile_ran_during_rearm());

    r.gate.notify_one();
    let o = task.await.unwrap();
    assert_eq!(o.dropped, 1);
    assert!(r.polls.holding_app_ids().is_empty(), "pending cleared");
    assert!(!r.polls.reconcile_ran_during_rearm(), "flag reset");
    let settled: Vec<_> = r
        .host
        .records()
        .into_iter()
        .filter_map(|x| match x {
            StreamRecord::State(StateEvent::RearmSettled {
                needs_reconcile, ..
            }) => Some(needs_reconcile),
            _ => None,
        })
        .collect();
    assert_eq!(settled, vec![true]);
}

#[tokio::test(start_paused = true)]
async fn rearm_settled_queues_until_ready_and_is_not_sent_without_a_query() {
    // Not READY: queued.
    let r = rig(true, false).await;
    r.store.record(APP, &record(NOW as f64), NOW);
    r.runner.on("pgrep -x steam", vec![out(1, "")]);
    let polls = r.polls.clone();
    let profile = r.profile.clone();
    let task = tokio::spawn(async move { rearm_persisted_holds(&polls, &profile).await });
    for _ in 0..10 {
        tokio::task::yield_now().await;
    }
    let _ = r.polls.holding_app_ids();
    r.gate.notify_one();
    task.await.unwrap();
    assert_eq!(r.outbox.queued_len(), 1);
    assert!(!r
        .host
        .records()
        .iter()
        .any(|x| matches!(x, StreamRecord::State(_))));

    // Dropped but no status query consulted the pending set: nothing is sent.
    let r2 = rig(false, true).await;
    r2.store.record(APP, &record(NOW as f64), NOW);
    r2.runner.on("pgrep -x steam", vec![out(1, "")]);
    let o = rearm_persisted_holds(&r2.polls, &r2.profile).await;
    assert_eq!(o.dropped, 1);
    assert!(!r2
        .host
        .records()
        .iter()
        .any(|x| matches!(x, StreamRecord::State(_))));
}
