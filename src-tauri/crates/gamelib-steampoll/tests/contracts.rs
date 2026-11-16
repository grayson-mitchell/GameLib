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

fn ts_const(src: &str, name: &str) -> u64 {
    let needle = format!("export const {name} = ");
    let line = src
        .lines()
        .find(|l| l.starts_with(&needle))
        .unwrap_or_else(|| panic!("{name} not found in pollState.ts"));
    let rest = &line[needle.len()..];
    let tok: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '_' || *c == '*' || *c == ' ')
        .collect();
    tok.split('*')
        .map(|p| p.trim().replace('_', "").parse::<u64>().expect("number"))
        .product()
}

#[test]
fn constants_match_pollstate_ts() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../src/backend/storeManagers/steam/library/pollState.ts"
    );
    let src = std::fs::read_to_string(path).expect("pollState.ts");
    let pairs: &[(&str, u64)] = &[
        (
            "GAMELIB_HANDOFF_STATE_FLAGS",
            GAMELIB_HANDOFF_STATE_FLAGS as u64,
        ),
        (
            "STEAM_HOLD_PROBE_MIN_INTERVAL_MS",
            STEAM_HOLD_PROBE_MIN_INTERVAL_MS,
        ),
        ("GRACE_TICKS", GRACE_TICKS as u64),
        ("MAX_TICKS", MAX_TICKS as u64),
        (
            "STEAM_REQUEST_NO_ACTIVITY_TICKS",
            STEAM_REQUEST_NO_ACTIVITY_TICKS as u64,
        ),
        ("MANIFEST_GONE_TICKS", MANIFEST_GONE_TICKS as u64),
        (
            "STEAM_INSTALLAPP_RETRY_EVERY_TICKS",
            STEAM_INSTALLAPP_RETRY_EVERY_TICKS as u64,
        ),
        (
            "STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS",
            STEAM_INSTALLAPP_RETRY_MAX_ATTEMPTS as u64,
        ),
        (
            "STEAM_UPDATE_ABANDONED_TICKS",
            STEAM_UPDATE_ABANDONED_TICKS as u64,
        ),
        ("STALLED_TICKS_THRESHOLD", STALLED_TICKS_THRESHOLD as u64),
        ("BYTES_PER_MIB", BYTES_PER_MIB),
    ];
    for (name, rust) in pairs {
        assert_eq!(ts_const(&src, name), *rust, "{name}");
    }
    assert!(src.contains("STEAM_BRIDGE_FINISHING_CONTEXT = 'steam-bridge-finishing'"));
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
    assert_eq!(ops.len(), 24);
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
