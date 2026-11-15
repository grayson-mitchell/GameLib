//! D-05 ordering, the R1 boot queue and the bounds, against `RecordingHost` under paused time.

use gamelib_steampoll::effects::{status_update, Continuation, Effect, LogLevel};
use gamelib_steampoll::events::{AckReply, StateEvent};
use gamelib_steampoll::outbox::{apply_effects, Outbox, MAX_QUEUED_APP_IDS};
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
    apply_effects(&host, &host, &outbox, fx, &mut title).await;
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
    apply_effects(&host, &host, &outbox, vec![transition("7", 3)], &mut title).await;
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
    apply_effects(&host, &host, &outbox, vec![transition("7", 3)], &mut title).await;
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
    apply_effects(&host, &host, &outbox, fx, &mut title).await;
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
    apply_effects(&host, &host, &outbox, vec![installed("1")], &mut title).await;
    assert_eq!(notify_title(&host).as_deref(), Some("From Reply"));

    let host = RecordingHost::new(acked(None));
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = "Cached".to_string();
    apply_effects(&host, &host, &outbox, vec![installed("1")], &mut title).await;
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
async fn effect_order_and_side_records_are_preserved() {
    let host = RecordingHost::new(acked(Some("T")));
    let outbox = Outbox::new();
    outbox.mark_ready(&host).await;
    let mut title = String::new();
    let fx = vec![
        status_update("1", "installing", None),
        Effect::WriteHoldRecord {
            app_id: "1".into(),
            record: json!({"a": 1}),
        },
        transition("1", 1),
        Effect::Log {
            level: LogLevel::Info,
            message: "x".into(),
        },
        Effect::ClearHoldRecord { app_id: "1".into() },
        status_update("1", "done", None),
    ];
    apply_effects(&host, &host, &outbox, fx, &mut title).await;
    assert_eq!(
        kinds(&host),
        vec![
            "fe:gameStatusUpdate",
            "file:record",
            "state:updateDone:1",
            "fe:gameStatusUpdate",
            "fe:gameStatusUpdate",
            "file:clear",
            "fe:gameStatusUpdate"
        ]
    );
}
