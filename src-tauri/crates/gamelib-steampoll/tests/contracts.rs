//! Cross-plan contract tests (Phase 80, plan 01).

use gamelib_steampoll::constants::*;
use gamelib_steampoll::events::{AckReply, StateEvent, Survivor};
use gamelib_steampoll::host::{Clock, ProcessRunner};
use gamelib_steampoll::registry::{PollKind, Registry};
use gamelib_steampoll::runtime::{SystemClock, TokioRunner};
use gamelib_steampoll::testing::{FakeClock, RecordingHost, ScriptedRunner};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

#[test]
fn poll_constants_hold_their_pinned_values() {
    // The TS poll these once mirrored is gone; the values stay pinned here because the
    // frontend copy and the saved UAT contract both quote them.
    assert_eq!(GAMELIB_HANDOFF_STATE_FLAGS, 1026);
    assert_eq!(STEAM_HOLD_PROBE_MIN_INTERVAL_MS, 10_000);
    assert_eq!(GRACE_TICKS, 20);
    assert_eq!(MAX_TICKS, 7200);
    assert_eq!(STEAM_REQUEST_NO_ACTIVITY_TICKS, 40);
    assert_eq!(MANIFEST_GONE_TICKS, 10);
    assert_eq!(STEAM_INSTALLAPP_RETRY_EVERY_TICKS, 3);
    assert_eq!(STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS, 13);
    assert_eq!(STEAM_UPDATE_ABANDONED_TICKS, 20);
    assert_eq!(STALLED_TICKS_THRESHOLD, 3);
    assert_eq!(BYTES_PER_MIB, 1024 * 1024);
    assert_eq!(STEAM_BRIDGE_FINISHING_CONTEXT, "steam-bridge-finishing");
    assert_eq!(STATE_FLAG_FULLY_INSTALLED, 0x4);
    assert_eq!(ACK_TIMEOUT_MS, 5000);
    assert_eq!(TICK_INTERVAL_MS, 3000);
    assert_eq!(RUNNING_POLL_INTERVAL_MS, 5000);
    assert_eq!(RUNNING_DRAIN_MS, 20_000);
}

#[test]
fn state_events_serialise_to_the_camelcase_wire_shape() {
    let cases: Vec<(StateEvent, serde_json::Value)> = vec![
        (
            StateEvent::Installed {
                app_id: "10".into(),
                seq: 1,
                source: "native".into(),
                install_path: "/g".into(),
                size_on_disk: "5".into(),
                buildid: Some("9".into()),
            },
            json!({"kind":"installed","appId":"10","seq":1,"source":"native","installPath":"/g","sizeOnDisk":"5","buildid":"9"}),
        ),
        (
            StateEvent::InstallIncomplete {
                app_id: "10".into(),
                seq: 2,
            },
            json!({"kind":"installIncomplete","appId":"10","seq":2}),
        ),
        (
            StateEvent::UpdateDone {
                app_id: "10".into(),
                seq: 3,
                completed: true,
            },
            json!({"kind":"updateDone","appId":"10","seq":3,"completed":true}),
        ),
        (
            StateEvent::Uninstalled {
                app_id: "10".into(),
                seq: 4,
                source: "bottle".into(),
                survivor: Some(Survivor {
                    source: "native".into(),
                    install_path: "/s".into(),
                    size_on_disk: "7".into(),
                    buildid: None,
                }),
            },
            json!({"kind":"uninstalled","appId":"10","seq":4,"source":"bottle","survivor":{"source":"native","installPath":"/s","sizeOnDisk":"7","buildid":null}}),
        ),
        (
            StateEvent::BridgeUninstalled {
                app_id: "10".into(),
                seq: 5,
            },
            json!({"kind":"bridgeUninstalled","appId":"10","seq":5}),
        ),
        (
            StateEvent::ForcedWindowsViaBottleCleared {
                app_id: "10".into(),
                seq: 6,
            },
            json!({"kind":"forcedWindowsViaBottleCleared","appId":"10","seq":6}),
        ),
        (
            StateEvent::MacArchVerdict {
                app_id: "10".into(),
                seq: 7,
                verdict: "32".into(),
            },
            json!({"kind":"macArchVerdict","appId":"10","seq":7,"verdict":"32"}),
        ),
        (
            StateEvent::RearmSettled {
                seq: 8,
                needs_reconcile: false,
            },
            json!({"kind":"rearmSettled","seq":8,"needsReconcile":false}),
        ),
    ];
    for (ev, wire) in cases {
        assert_eq!(serde_json::to_value(&ev).unwrap(), wire);
        let back: StateEvent = serde_json::from_value(wire).unwrap();
        assert_eq!(back, ev);
        assert_eq!(ev.key().1, ev.kind());
    }
}

#[test]
fn ack_reply_is_lenient() {
    let a: AckReply = serde_json::from_value(json!({"applied": false})).unwrap();
    assert_eq!(a, AckReply::not_acked());
    assert_eq!(
        AckReply::from_value(json!("garbage")),
        AckReply::not_acked()
    );
    assert_eq!(
        AckReply::from_value(json!({"applied": "x"})),
        AckReply::not_acked()
    );
    let full = AckReply::from_value(
        json!({"applied":true,"title":"T","macArchCheck":true,"bridgeAuthoritative":false,"extra":1}),
    );
    assert!(full.applied);
    assert_eq!(full.title.as_deref(), Some("T"));
    assert_eq!(full.mac_arch_check, Some(true));
    assert_eq!(full.bridge_authoritative, Some(false));
}

#[test]
fn ops_sorted_and_unique() {
    let ops = gamelib_steampoll::OPS;
    assert_eq!(ops.len(), 27);
    assert!(ops.windows(2).all(|w| w[0] < w[1]));
}

#[test]
fn dispatch_unknown_op_is_an_error() {
    assert_eq!(
        gamelib_steampoll::dispatch("steampoll_nope", &[]),
        Err("steampoll_nope:unknown-op".to_string())
    );
}

fn registry() -> Registry {
    Registry::new(
        tokio::runtime::Handle::current(),
        Arc::new(RecordingHost::default()),
        Arc::new(ScriptedRunner::default()),
        Arc::new(FakeClock::new(0)),
    )
}

#[tokio::test(start_paused = true)]
async fn registry_register_cancel_and_guard_drop() {
    let reg = registry();
    let (token, guard) = reg.register(PollKind::Install, "10");
    assert!(reg.is_active(PollKind::Install, "10"));
    assert!(!reg.is_active(PollKind::Uninstall, "10"));
    assert!(reg.cancel(PollKind::Install, "10"));
    assert!(token.is_cancelled());
    assert!(!reg.cancel(PollKind::Install, "11"));
    drop(guard);
    assert!(!reg.is_active(PollKind::Install, "10"));
    assert_eq!(reg.next_notice_seq(), 1);
    assert_eq!(reg.next_notice_seq(), 2);
}

#[tokio::test(start_paused = true)]
async fn registry_replaced_entry_survives_old_guard_drop() {
    let reg = registry();
    let (_t1, g1) = reg.register(PollKind::Running, "0");
    let (_t2, _g2) = reg.register(PollKind::Running, "0");
    drop(g1);
    assert!(reg.is_active(PollKind::Running, "0"));
}

#[tokio::test(start_paused = true)]
async fn cancel_all_and_wait_returns_after_tasks_stop_or_at_deadline() {
    let reg = registry();
    let (token, guard) = reg.register(PollKind::Install, "1");
    reg.spawn(async move {
        token.cancelled().await;
        tokio::time::sleep(Duration::from_secs(2)).await;
        drop(guard);
    });
    assert_eq!(reg.cancel_all_and_wait(Duration::from_secs(10)).await, 0);
    assert!(!reg.is_active(PollKind::Install, "1"));

    let (_token, _stuck) = reg.register(PollKind::Install, "2");
    assert_eq!(reg.cancel_all_and_wait(Duration::from_secs(1)).await, 1);
}

#[tokio::test]
async fn tokio_runner_exit_code_and_timeout() {
    let (prog, argv): (&str, Vec<String>) = if cfg!(windows) {
        ("cmd", vec!["/C".into(), "exit 3".into()])
    } else {
        ("/bin/sh", vec!["-c".into(), "exit 3".into()])
    };
    let out = TokioRunner.run(prog, argv, Duration::from_secs(10)).await;
    assert_eq!(out.code, Some(3));

    let (prog, argv): (&str, Vec<String>) = if cfg!(windows) {
        ("ping", vec!["-n".into(), "6".into(), "127.0.0.1".into()])
    } else {
        ("sleep", vec!["5".into()])
    };
    let out = TokioRunner
        .run(prog, argv, Duration::from_millis(100))
        .await;
    assert_eq!(out.code, None);
}

#[test]
fn system_clock_is_wall_time() {
    assert!(SystemClock.now_ms() > 1_700_000_000_000);
}

/// 80-REVIEW C-WR-08: the producer side of the state-event wire parity. Every `StateEvent`
/// variant, with the edge values Rust can really emit (a raw empty or non-numeric SizeOnDisk, a
/// long buildid, an installdir-joined path past 4096 bytes, the largest appId and a large seq),
/// serialised and pinned to `tests/fixtures/state-events.json`. The sidecar's
/// `steamPollStateEventParity.test.ts` parses that same file with the zod schema, so a change on
/// either side fails one of the two tests. Regenerate with `GAMELIB_REGEN_STATE_EVENTS=1`.
#[test]
fn state_event_wire_fixture_matches_every_variant() {
    let long_path = format!(
        "/Volumes/Games/SteamLibrary/steamapps/common/{}",
        "a".repeat(4200)
    );
    let events = vec![
        StateEvent::Installed {
            app_id: "4294967295".into(),
            seq: 9_007_199_254_740_991,
            source: "native".into(),
            install_path: "/steam/steamapps/common/Game".into(),
            size_on_disk: "50000".into(),
            buildid: Some("12345678".into()),
        },
        StateEvent::Installed {
            app_id: "480".into(),
            seq: 2,
            source: "bottle".into(),
            install_path: long_path.clone(),
            size_on_disk: String::new(),
            buildid: None,
        },
        StateEvent::Installed {
            app_id: "480".into(),
            seq: 3,
            source: "bridge".into(),
            install_path: "/b/steamapps/common/".into(),
            size_on_disk: "not-a-number".into(),
            buildid: Some("b".repeat(64)),
        },
        StateEvent::InstallIncomplete {
            app_id: "480".into(),
            seq: 4,
        },
        StateEvent::UpdateDone {
            app_id: "480".into(),
            seq: 5,
            completed: true,
        },
        StateEvent::Uninstalled {
            app_id: "480".into(),
            seq: 6,
            source: "native".into(),
            survivor: None,
        },
        StateEvent::Uninstalled {
            app_id: "480".into(),
            seq: 7,
            source: "native".into(),
            survivor: Some(Survivor {
                source: "bottle".into(),
                install_path: long_path,
                size_on_disk: String::new(),
                buildid: None,
            }),
        },
        StateEvent::BridgeUninstalled {
            app_id: "480".into(),
            seq: 8,
        },
        StateEvent::ForcedWindowsViaBottleCleared {
            app_id: "480".into(),
            seq: 9,
        },
        StateEvent::MacArchVerdict {
            app_id: "480".into(),
            seq: 10,
            verdict: "32".into(),
        },
        StateEvent::MacArchVerdict {
            app_id: "480".into(),
            seq: 11,
            verdict: "64".into(),
        },
        StateEvent::RearmSettled {
            seq: 12,
            needs_reconcile: true,
        },
        StateEvent::AdoptionState {
            app_id: "480".into(),
            seq: 13,
            adopted: true,
            signed_in: Some(true),
        },
        StateEvent::AdoptionState {
            app_id: "480".into(),
            seq: 14,
            adopted: false,
            signed_in: None,
        },
    ];
    // Every kind is covered.
    let kinds: std::collections::BTreeSet<&str> = events.iter().map(StateEvent::kind).collect();
    assert_eq!(kinds.len(), 9);

    let wire = serde_json::to_string_pretty(&events).unwrap() + "\n";
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/state-events.json");
    if std::env::var_os("GAMELIB_REGEN_STATE_EVENTS").is_some() {
        std::fs::write(&path, &wire).unwrap();
    }
    let pinned = std::fs::read_to_string(&path).expect("state-events.json fixture");
    assert_eq!(
        pinned, wire,
        "regenerate with GAMELIB_REGEN_STATE_EVENTS=1 and update the zod schema"
    );
}
