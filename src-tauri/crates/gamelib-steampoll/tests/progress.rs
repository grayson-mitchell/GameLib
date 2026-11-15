//! Vectors ported from steamDownloadProgress.test.ts and the formatEta / rollingRateMiBs cases
//! of depot.test.ts.

use gamelib_steampoll::progress::*;

const STARTED: &str = "[2026-10-29 20:12:03] AppID 43160 update started : download 0/8736151712, store 0/0, reuse 0/0, delta 0/0, stage 0/9614286648 \r";

fn ended(id: &str) -> Option<ContentLogEvent> {
    Some(ContentLogEvent::Ended {
        app_id: id.to_string(),
    })
}

#[test]
fn parses_crlf_update_started() {
    assert_eq!(
        parse_content_log_line(STARTED),
        Some(ContentLogEvent::Started {
            app_id: "43160".into(),
            download_done: 0.0,
            download_total: 8736151712.0
        })
    );
}

#[test]
fn parses_a_resumed_download() {
    let ev = parse_content_log_line(
        "[x] AppID 238320 update started : download 1048576/2813215248, store 0/0 \r",
    );
    assert!(matches!(
        ev,
        Some(ContentLogEvent::Started { download_done, download_total, .. })
            if download_done == 1048576.0 && download_total == 2813215248.0
    ));
}

#[test]
fn parses_phase_lines() {
    assert_eq!(
        parse_content_log_line(
            "[x] AppID 43160 App update changed : Running Update,Downloading,Staging,\r"
        ),
        Some(ContentLogEvent::Phase {
            app_id: "43160".into(),
            phase: "Running Update,Downloading,Staging".into()
        })
    );
}

#[test]
fn ended_lines() {
    for line in [
        "[x] AppID 43160 scheduler finished : removed from schedule (result No Error, state 0xc) \r",
        "[x] AppID 43160 finished update, 1 mounted depots (BuildID 4597280) : x\r",
        "[x] AppID 43160 App update changed : None\r",
        "[x] AppID 43160 update canceled : foo\r",
    ] {
        assert_eq!(parse_content_log_line(line), ended("43160"), "{line}");
    }
}

#[test]
fn client_start_line_is_a_session_boundary() {
    assert_eq!(
        parse_content_log_line("[2026-11-03 19:49:43] Client version: 1792618285\r"),
        Some(ContentLogEvent::Session)
    );
}

#[test]
fn ignores_unrelated_lines() {
    assert_eq!(
        parse_content_log_line("[x] AppID 43160 preallocated 29 files (9168 MB) \r"),
        None
    );
    assert_eq!(parse_content_log_line("garbage"), None);
}

#[test]
fn nettop_rows() {
    assert_eq!(parse_nettop_row(",bytes_in,\r"), Some(NettopRow::Header));
    assert_eq!(
        parse_nettop_row("tcp4 10.0.0.5:50123<->23.45.6.7:443,123456,\r"),
        Some(NettopRow::Flow {
            flow: "10.0.0.5:50123<->23.45.6.7:443".into(),
            bytes_in: 123456.0
        })
    );
    assert_eq!(parse_nettop_row("tcp4 127.0.0.1:1<->127.0.0.1:2,5,"), None);
    assert_eq!(parse_nettop_row("tcp6 ::1.1<->::1.2,5,"), None);
    assert_eq!(parse_nettop_row("tcp4 1.1.1.1:1<->2.2.2.2:2,,"), None);
    assert_eq!(parse_nettop_row("steam_osx.48169,99,"), None);
    assert_eq!(parse_nettop_row("nonsense"), None);
}

fn flow(f: &str, b: f64) -> NettopRow {
    NettopRow::Flow {
        flow: f.into(),
        bytes_in: b,
    }
}

#[test]
fn accumulator_baselines_block_one_then_sums_positive_deltas() {
    let mut a = FlowAccumulator::new();
    apply_nettop_row(&mut a, &NettopRow::Header);
    apply_nettop_row(&mut a, &flow("a", 1000.0));
    assert_eq!(a.cum, 0.0);
    apply_nettop_row(&mut a, &NettopRow::Header);
    apply_nettop_row(&mut a, &flow("a", 1500.0));
    apply_nettop_row(&mut a, &flow("b", 200.0)); // new flow counts from 0
    assert_eq!(a.cum, 700.0);
}

#[test]
fn accumulator_decrease_adds_nothing_and_closed_flows_never_drop_cum() {
    let mut a = FlowAccumulator::new();
    apply_nettop_row(&mut a, &NettopRow::Header);
    apply_nettop_row(&mut a, &flow("a", 1000.0));
    apply_nettop_row(&mut a, &NettopRow::Header);
    apply_nettop_row(&mut a, &flow("a", 100.0));
    assert_eq!(a.cum, 0.0);
    apply_nettop_row(&mut a, &NettopRow::Header);
    apply_nettop_row(&mut a, &flow("a", 150.0));
    assert_eq!(a.cum, 50.0);
    apply_nettop_row(&mut a, &NettopRow::Header);
    assert_eq!(a.cum, 50.0);
}

#[test]
fn tracker_session_boundary_drops_every_earlier_update() {
    let mut t = UpdateTracker::new();
    apply_content_log_event(&mut t, &parse_content_log_line(STARTED).unwrap(), 0.0);
    apply_content_log_event(&mut t, &ContentLogEvent::Session, 0.0);
    assert_eq!(active_count(&t), 0);
}

#[test]
fn tracker_tracks_start_end_and_rebaseline() {
    let mut t = UpdateTracker::new();
    let started = |done| ContentLogEvent::Started {
        app_id: "1".into(),
        download_done: done,
        download_total: 10.0,
    };
    apply_content_log_event(&mut t, &started(5.0), 0.0);
    assert_eq!(active_count(&t), 1);
    apply_content_log_event(&mut t, &started(7.0), 42.0);
    assert_eq!(
        t.active.get("1"),
        Some(&ActiveUpdate {
            download_done: 7.0,
            download_total: 10.0,
            cum_at_start: 42.0
        })
    );
    apply_content_log_event(&mut t, &ContentLogEvent::Ended { app_id: "1".into() }, 50.0);
    assert_eq!(active_count(&t), 0);
}

fn base() -> LiveProgressInput {
    LiveProgressInput {
        download_done: 0.0,
        download_total: 8736151712.0,
        cum_at_start: 0.0,
        cum_now: 0.0,
        acf_bytes_downloaded: 0.0,
        acf_bytes_to_download: 8736151712.0,
    }
}

#[test]
fn live_progress_percent_and_cap() {
    let p = live_progress(&LiveProgressInput {
        cum_now: 4368075856.0,
        ..base()
    })
    .unwrap();
    assert!((p.percent - 50.0).abs() < 1e-5);
    assert_eq!(p.bytes_done, 4368075856.0);
    let capped = live_progress(&LiveProgressInput {
        cum_now: 8770693182.0,
        ..base()
    })
    .unwrap();
    assert_eq!(capped.percent, 99.0);
}

#[test]
fn live_progress_floors_at_acf_and_falls_back_to_log_total() {
    let floored = live_progress(&LiveProgressInput {
        acf_bytes_downloaded: 100.0,
        ..base()
    })
    .unwrap();
    assert_eq!(floored.bytes_done, 100.0);
    let fallback = live_progress(&LiveProgressInput {
        acf_bytes_to_download: 0.0,
        cum_now: 10.0,
        ..base()
    })
    .unwrap();
    assert_eq!(fallback.total, 8736151712.0);
    assert_eq!(
        live_progress(&LiveProgressInput {
            download_total: 0.0,
            acf_bytes_to_download: 0.0,
            cum_now: 1.0,
            ..base()
        }),
        None
    );
}

fn s(ms: f64, cum: f64) -> Sample {
    Sample { ms, cum }
}

#[test]
fn window_rate_inside_window_and_unmeasurable_cases() {
    assert_eq!(
        window_rate(&[s(1000.0, 0.0), s(2000.0, 10.0), s(3000.0, 30.0)], 3000.0),
        Some(15.0)
    );
    assert_eq!(window_rate(&[s(0.0, 0.0)], 0.0), None);
    assert_eq!(window_rate(&[s(1000.0, 0.0), s(1200.0, 5.0)], 1200.0), None);
    assert_eq!(window_rate(&[s(0.0, 0.0), s(1000.0, 5.0)], 10000.0), None);
    assert_eq!(window_rate(&[s(0.0, 10.0), s(1000.0, 5.0)], 1000.0), None);
}

#[test]
fn format_eta_vectors() {
    assert_eq!(format_eta(0.0), "00:00:00");
    assert_eq!(format_eta(47.0), "00:00:47");
    assert_eq!(format_eta(1247.0), "00:20:47");
    assert_eq!(format_eta(3723.0), "01:02:03");
    assert_eq!(format_eta(90061.0), "25:01:01");
    assert_eq!(format_eta(-5.0), "00:00:00");
    assert_eq!(format_eta(2.5), "00:00:03"); // Math.round half up
}

#[test]
fn rolling_rate_vectors() {
    const MIB: f64 = 1024.0 * 1024.0;
    assert!((rolling_rate_mib_s(5.0 * MIB, 500.0, 0.0) - 10.0).abs() < 1e-9);
    assert_eq!(rolling_rate_mib_s(0.0, 500.0, 42.0), 0.0);
    assert_eq!(rolling_rate_mib_s(MIB, 1.0, 7.5), 7.5);
    assert_eq!(rolling_rate_mib_s(-MIB, 500.0, 3.0), 0.0);
}
