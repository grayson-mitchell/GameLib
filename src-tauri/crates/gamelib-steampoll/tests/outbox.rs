//! D-05 ordering, the R1 boot queue and the bounds, against `RecordingHost` under paused time.

use gamelib_steampoll::effects::{status_update, Continuation, Effect, LogLevel};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::outbox::{apply_effects, apply_effects_with, Outbox, MAX_QUEUED_APP_IDS};
use gamelib_steampoll::testing::{AckMode, RecordingHost, StreamRecord};
use serde_json::json;
use std::time::Duration;

fn updated(app_id: &str, seq: u64) -> StateEvent {
    StateEvent::UpdateDone {
        app_id: app_id.into(),
        seq,
        completed: true,
    }
}

fn transition(app_id: &str, seq: u64) -> Effect {
    Effect::Transition {
        event: updated(app_id, seq),
        then: Continuation::UpdateDone {
            app_id: app_id.into(),
            completed: true,
        },
    }
}

fn kinds(host: &RecordingHost) -> Vec<String> {
    host.records()
        .iter()
        .map(|r| match r {
            StreamRecord::State(e) => format!("state:{}:{}", e.kind(), e.seq()),
            StreamRecord::Frontend { channel, .. } => format!("fe:{channel}"),
            StreamRecord::Notify { .. } => "notify".into(),
            StreamRecord::File { op, .. } => format!("file:{op}"),
        })
        .collect()
}

fn acked(title: Option<&str>) -> AckMode {
    AckMode::Reply(AckReply {
        applied: true,
        title: title.map(String::from),
        ..AckReply::default()
    })
}

#[tokio::test(start_paused = true)]
async fn ready_and_acked_orders_state_then_frontend_then_notify() {
    let host = RecordingHost::new(acked(Some("Game")));
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = String::new();
    let fx = vec![Effect::Transition {
        event: StateEvent::Uninstalled {
            app_id: "1".into(),
            seq: 1,
            source: "native".into(),
            survivor: None,
        },
        then: Continuation::Uninstalled {
            app_id: "1".into(),
            removed_source: "native".into(),
            survivor_source: None,
        },
    }];
    apply_effects(&host, &outbox, fx, &mut title).await;
    assert_eq!(
        kinds(&host),
        vec!["state:uninstalled:1", "fe:gameStatusUpdate", "notify"]
    );
    assert_eq!(outbox.queued_len(), 0);
    assert_eq!(title, "Game");
}

#[tokio::test(start_paused = true)]
async fn ready_without_ack_waits_five_seconds_then_logs() {
    let host = RecordingHost::new(AckMode::Never);
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = String::new();
    let start = tokio::time::Instant::now();
    apply_effects(&host, &outbox, vec![transition("7", 3)], &mut title).await;
    assert!(start.elapsed() >= Duration::from_millis(5000));
    assert!(start.elapsed() < Duration::from_millis(5100));
    assert_eq!(
        kinds(&host),
        vec![
            "state:updateDone:3",
            "fe:gameStatusUpdate",
            "fe:gameStatusUpdate"
        ]
    );
    let logs = outbox.logs();
    assert!(logs
        .iter()
        .any(|l| l.contains("7") && l.contains("updateDone") && l.contains("ack timeout")));
    // Timed out: stays queued for a later replay.
    assert_eq!(outbox.queued_len(), 1);
}

#[tokio::test(start_paused = true)]
async fn not_ready_queues_and_runs_post_ack_effects_at_once() {
    let host = RecordingHost::new(acked(None));
    let outbox = Outbox::new();
    let mut title = String::new();
    let start = tokio::time::Instant::now();
    apply_effects(&host, &outbox, vec![transition("7", 3)], &mut title).await;
    assert_eq!(start.elapsed(), Duration::ZERO);
    // No state record: the event was queued, not sent.
    assert_eq!(
        kinds(&host),
        vec!["fe:gameStatusUpdate", "fe:gameStatusUpdate"]
    );
    assert_eq!(outbox.queued_len(), 1);
    outbox.mark_ready(&host).await;
    assert_eq!(
        kinds(&host),
        vec![
            "fe:gameStatusUpdate",
            "fe:gameStatusUpdate",
            "state:updateDone:3"
        ]
    );
    assert_eq!(outbox.queued_len(), 0);
}

#[tokio::test(start_paused = true)]
async fn replay_is_ascending_seq_latest_wins_per_key() {
    let host = RecordingHost::new(acked(None));
    let outbox = Outbox::new();
    outbox.enqueue(updated("a", 5));
    outbox.enqueue(updated("b", 2));
    outbox.enqueue(updated("a", 9)); // replaces a:5
    outbox.enqueue(StateEvent::InstallIncomplete {
        app_id: "a".into(),
        seq: 4,
    });
    outbox.enqueue(updated("a", 1)); // older than the queued a:9, ignored
    assert_eq!(outbox.queued_len(), 3);
    outbox.mark_ready(&host).await;
    assert_eq!(
        kinds(&host),
        vec![
            "state:updateDone:2",
            "state:installIncomplete:4",
            "state:updateDone:9"
        ]
    );
}

// ---- cross-kind ordering and in-session retry (80-REVIEW A/WR-08) ----------------------------

fn installed_ev(app_id: &str, seq: u64) -> StateEvent {
    StateEvent::Installed {
        app_id: app_id.into(),
        seq,
        source: "native".into(),
        install_path: "/x/steamapps/common/G".into(),
        size_on_disk: "1".into(),
        buildid: None,
    }
}

fn uninstalled_ev(app_id: &str, seq: u64) -> StateEvent {
    StateEvent::Uninstalled {
        app_id: app_id.into(),
        seq,
        source: "native".into(),
        survivor: None,
    }
}

fn state_transition(event: StateEvent) -> Effect {
    Effect::Transition {
        then: Continuation::UpdateDone {
            app_id: event.app_id().into(),
            completed: false,
        },
        event,
    }
}

/// The reviewer's case: `installed` seq 5 timed out and was queued, then `uninstalled` seq 9 was
/// acked live. A later replay must not flip the app back to installed.
#[tokio::test(start_paused = true)]
async fn a_newer_applied_uninstalled_drops_the_queued_older_installed() {
    let host = RecordingHost::new(AckMode::Never);
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = String::new();
    apply_effects(
        &host,
        &outbox,
        vec![state_transition(installed_ev("a", 5))],
        &mut title,
    )
    .await;
    assert_eq!(outbox.queued_len(), 1);
    host.set_ack(acked(None));
    apply_effects(
        &host,
        &outbox,
        vec![state_transition(uninstalled_ev("a", 9))],
        &mut title,
    )
    .await;
    assert_eq!(outbox.queued_len(), 0, "{:?}", outbox.queued());
    assert_eq!(outbox.retry_pending(&host).await, 0);
    let states: Vec<String> = kinds(&host)
        .into_iter()
        .filter(|k| k.starts_with("state:"))
        .collect();
    assert_eq!(states, vec!["state:installed:5", "state:uninstalled:9"]);
}

/// An older install-state event whose ack fails after a newer one was applied is not queued.
#[tokio::test(start_paused = true)]
async fn an_older_state_event_failing_after_a_newer_applied_one_is_not_queued() {
    let host = RecordingHost::new(acked(None));
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = String::new();
    apply_effects(
        &host,
        &outbox,
        vec![state_transition(uninstalled_ev("a", 9))],
        &mut title,
    )
    .await;
    host.set_ack(AckMode::Reply(AckReply::not_acked()));
    apply_effects(
        &host,
        &outbox,
        vec![state_transition(installed_ev("a", 5))],
        &mut title,
    )
    .await;
    assert_eq!(outbox.queued_len(), 0, "{:?}", outbox.queued());
}

/// Before READY, only the newest install-state event per appId is kept; independent kinds stay.
#[tokio::test(start_paused = true)]
async fn queue_keeps_only_the_newest_install_state_event_per_app() {
    let host = RecordingHost::new(acked(None));
    let outbox = Outbox::new();
    outbox.enqueue(installed_ev("a", 5));
    outbox.enqueue(updated("a", 6));
    outbox.enqueue(uninstalled_ev("a", 9));
    outbox.enqueue(installed_ev("a", 7)); // older than the queued uninstalled:9, ignored
    outbox.enqueue(installed_ev("b", 8));
    outbox.mark_ready(&host).await;
    assert_eq!(
        kinds(&host),
        vec![
            "state:updateDone:6",
            "state:installed:8",
            "state:uninstalled:9"
        ]
    );
    assert_eq!(outbox.queued_len(), 0);
}

/// A timed-out event is retried in session, without a sidecar restart, once the host's timer
/// calls `retry_pending`.
#[tokio::test(start_paused = true)]
async fn retry_pending_replays_an_unacked_event_while_ready() {
    let host = RecordingHost::new(AckMode::Never);
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = String::new();
    apply_effects(&host, &outbox, vec![transition("7", 3)], &mut title).await;
    assert_eq!(outbox.queued_len(), 1);
    // Still not acking: the retry keeps it queued.
    assert_eq!(outbox.retry_pending(&host).await, 1);
    host.set_ack(acked(None));
    assert_eq!(outbox.retry_pending(&host).await, 0);
    // Not ready: nothing is sent.
    outbox.enqueue(updated("8", 4));
    outbox.mark_not_ready();
    let before = host.records().len();
    assert_eq!(outbox.retry_pending(&host).await, 1);
    assert_eq!(host.records().len(), before);
}

#[tokio::test(start_paused = true)]
async fn progress_effects_never_wait_and_send_no_state() {
    let host = RecordingHost::new(AckMode::Never);
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = String::new();
    let start = tokio::time::Instant::now();
    let fx = vec![Effect::Frontend {
        channel: "progressUpdate".into(),
        args: vec![json!({"percent": 10})],
    }];
    apply_effects(&host, &outbox, fx, &mut title).await;
    assert_eq!(start.elapsed(), Duration::ZERO);
    assert_eq!(kinds(&host), vec!["fe:progressUpdate"]);
}

#[tokio::test(start_paused = true)]
async fn title_comes_from_reply_or_the_cached_title() {
    let installed = |app: &str| Effect::Transition {
        event: StateEvent::Installed {
            app_id: app.into(),
            seq: 1,
            source: "native".into(),
            install_path: "/p".into(),
            size_on_disk: "1".into(),
            buildid: None,
        },
        then: Continuation::Installed {
            app_id: app.into(),
            installer_owns_completion: false,
            bridge_install_finalized: false,
            skipped_depots: vec![],
            notify_restart_steam: false,
        },
    };
    let notify_title = |host: &RecordingHost| {
        host.records().iter().find_map(|r| match r {
            StreamRecord::Notify { title, .. } => Some(title.clone()),
            _ => None,
        })
    };

    let host = RecordingHost::new(acked(Some("From Reply")));
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = "Cached".to_string();
    apply_effects(&host, &outbox, vec![installed("1")], &mut title).await;
    assert_eq!(notify_title(&host).as_deref(), Some("From Reply"));

    let host = RecordingHost::new(acked(None));
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = "Cached".to_string();
    apply_effects(&host, &outbox, vec![installed("1")], &mut title).await;
    assert_eq!(notify_title(&host).as_deref(), Some("Cached"));
}

#[tokio::test(start_paused = true)]
async fn queue_is_bounded_by_app_id_cap() {
    let outbox = Outbox::new();
    for i in 0..(MAX_QUEUED_APP_IDS as u64 + 10) {
        outbox.enqueue(updated(&format!("app{i}"), i + 1));
    }
    assert_eq!(outbox.queued_len(), MAX_QUEUED_APP_IDS);
    let host = RecordingHost::new(acked(None));
    outbox.mark_ready(&host).await;
    // The oldest-seq appIds were dropped; the first replayed is seq 11.
    assert_eq!(kinds(&host)[0], "state:updateDone:11");
    assert!(outbox
        .logs()
        .iter()
        .any(|l| l.contains("dropped appId app0")));
}

#[tokio::test(start_paused = true)]
async fn effect_order_is_preserved() {
    let host = RecordingHost::new(acked(Some("T")));
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = String::new();
    let fx = vec![
        status_update("1", "installing", None),
        transition("1", 1),
        Effect::Log {
            level: LogLevel::Info,
            message: "x".into(),
        },
        status_update("1", "done", None),
    ];
    apply_effects(&host, &outbox, fx, &mut title).await;
    assert_eq!(
        kinds(&host),
        vec![
            "fe:gameStatusUpdate",
            "state:updateDone:1",
            "fe:gameStatusUpdate",
            "fe:gameStatusUpdate",
            "fe:gameStatusUpdate"
        ]
    );
}

// ---- bridge finalized read at the send site (80-REVIEW C-WR-05) -------------------------------

fn bridge_installed(app_id: &str) -> Effect {
    Effect::Transition {
        event: installed_ev(app_id, 1),
        then: Continuation::Installed {
            app_id: app_id.into(),
            installer_owns_completion: true,
            // The tick's snapshot: not finalized yet when the manifest was observed.
            bridge_install_finalized: false,
            skipped_depots: vec![],
            notify_restart_steam: false,
        },
    }
}

fn status_frontends(host: &RecordingHost) -> usize {
    host.records()
        .iter()
        .filter(|r| matches!(r, StreamRecord::Frontend { channel, .. } if channel == "gameStatusUpdate"))
        .count()
}

/// The installer finalizes (and sends its own `done`) while the `installed` ack is still out.
/// The finishing status must not follow it.
#[tokio::test(start_paused = true)]
async fn finalization_during_the_ack_suppresses_the_finishing_status() {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    let host = RecordingHost::new(AckMode::Never);
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let finalized = Arc::new(AtomicBool::new(false));
    let read = {
        let f = finalized.clone();
        move |_: &str| f.load(Ordering::SeqCst)
    };
    let mut title = String::new();
    let flip = {
        let f = finalized.clone();
        async move {
            tokio::time::sleep(Duration::from_millis(1000)).await;
            f.store(true, Ordering::SeqCst);
        }
    };
    tokio::join!(
        apply_effects_with(
            &host,
            &outbox,
            vec![bridge_installed("1")],
            &mut title,
            Some(&read),
        ),
        flip
    );
    assert_eq!(status_frontends(&host), 0);
}

#[tokio::test(start_paused = true)]
async fn an_unfinalized_bridge_install_still_reports_finishing() {
    let host = RecordingHost::new(acked(None));
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let read = |_: &str| false;
    let mut title = String::new();
    apply_effects_with(
        &host,
        &outbox,
        vec![bridge_installed("1")],
        &mut title,
        Some(&read),
    )
    .await;
    let finishing = host.records().iter().any(|r| match r {
        StreamRecord::Frontend { channel, args } => {
            channel == "gameStatusUpdate" && args[0]["context"] == "steam-bridge-finishing"
        }
        _ => false,
    });
    assert!(finishing);
}

/// Without a live read the snapshot still decides (the uninstall and re-arm appliers).
#[tokio::test(start_paused = true)]
async fn without_a_live_read_the_snapshot_decides() {
    let host = RecordingHost::new(acked(None));
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = String::new();
    apply_effects(&host, &outbox, vec![bridge_installed("1")], &mut title).await;
    assert_eq!(status_frontends(&host), 1);
}
