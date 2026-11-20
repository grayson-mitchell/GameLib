//! The Windows live progress source (debug `win-steam-handoff-progress-zero`): the pure counter
//! tracker and progress math, the per-appId source over an injected counter, and, on Windows only,
//! the real Win32 reads exercised against this test process itself.
//!
//! No test here needs a running Steam: the numbers in the math tests are the ones measured live
//! on 2026-11-19 (Banner Saga 237990, 3.18 GB download / 3.34 GB staged, 3.306 GB written).

use gamelib_steampoll::host::{Clock, PollHost, ProcessRunner};
use gamelib_steampoll::monitor::DownloadMonitor;
use gamelib_steampoll::progress::{live_progress, LiveProgressInput};
use gamelib_steampoll::testing::{AckMode, FakeClock, RecordingHost, ScriptedRunner};
use gamelib_steampoll::win_live::{
    reading_from_write_delta, wide_image_name_is, CounterSample, WindowsLiveSource,
    WriteCounterTracker, MAX_FRACTION,
};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

const TO_DOWNLOAD: u64 = 3_184_165_888;
const TO_STAGE: u64 = 3_335_661_215;

fn sample(pid: u32, write_bytes: u64) -> Option<CounterSample> {
    Some(CounterSample { pid, write_bytes })
}

// ---- WriteCounterTracker ---------------------------------------------------------------------

#[test]
fn the_first_sample_is_the_baseline() {
    let mut t = WriteCounterTracker::new();
    assert_eq!(t.observe(sample(10, 1_317_771_317)), Some(0));
    assert_eq!(t.observe(sample(10, 1_317_771_317 + 500)), Some(500));
    assert_eq!(t.observe(sample(10, 1_317_771_317 + 2_000)), Some(2_000));
}

#[test]
fn nothing_is_known_before_the_first_readable_sample() {
    let mut t = WriteCounterTracker::new();
    assert_eq!(t.observe(None), None);
    assert_eq!(t.observe(None), None);
    assert_eq!(t.observe(sample(10, 99)), Some(0));
}

#[test]
fn an_unreadable_sample_holds_the_last_total() {
    let mut t = WriteCounterTracker::new();
    t.observe(sample(10, 1_000));
    assert_eq!(t.observe(sample(10, 1_800)), Some(800));
    assert_eq!(
        t.observe(None),
        Some(800),
        "one failed read must not drop to 0"
    );
    assert_eq!(t.observe(sample(10, 2_000)), Some(1_000));
}

#[test]
fn a_new_steam_pid_rebaselines_and_keeps_what_was_already_written() {
    let mut t = WriteCounterTracker::new();
    t.observe(sample(10, 1_000));
    assert_eq!(t.observe(sample(10, 1_500)), Some(500));
    // Steam restarted: a fresh process, its counter starts near 0.
    assert_eq!(t.observe(sample(77, 40)), Some(500), "no step backwards");
    assert_eq!(t.observe(sample(77, 140)), Some(600));
}

#[test]
fn a_counter_that_goes_backwards_on_one_pid_is_a_new_segment() {
    let mut t = WriteCounterTracker::new();
    t.observe(sample(10, 1_000));
    assert_eq!(t.observe(sample(10, 1_400)), Some(400));
    assert_eq!(t.observe(sample(10, 50)), Some(400));
    assert_eq!(t.observe(sample(10, 120)), Some(470));
}

#[test]
fn extreme_counters_never_overflow() {
    let mut t = WriteCounterTracker::new();
    t.observe(sample(1, 0));
    t.observe(sample(1, u64::MAX));
    t.observe(sample(2, 0));
    assert_eq!(t.observe(sample(2, u64::MAX)), Some(u64::MAX));
}

// ---- reading_from_write_delta ----------------------------------------------------------------

#[test]
fn half_of_the_stage_size_written_is_half_the_download() {
    let r = reading_from_write_delta(TO_STAGE / 2, TO_STAGE, TO_DOWNLOAD).unwrap();
    assert_eq!(r.bytes_total, TO_DOWNLOAD as f64);
    assert!((r.bytes_done - TO_DOWNLOAD as f64 / 2.0).abs() < 2.0);
    assert_eq!(r.speed_bytes_per_sec, None);
}

#[test]
fn the_reading_feeds_the_steps_live_progress_to_the_same_percent() {
    let r = reading_from_write_delta(TO_STAGE / 4, TO_STAGE, TO_DOWNLOAD).unwrap();
    let p = live_progress(&LiveProgressInput {
        download_done: r.bytes_done,
        download_total: r.bytes_total,
        cum_at_start: 0.0,
        cum_now: 0.0,
        acf_bytes_downloaded: 0.0,
        acf_bytes_to_download: TO_DOWNLOAD as f64,
    })
    .unwrap();
    assert_eq!(p.total, TO_DOWNLOAD as f64);
    assert!((p.percent - 25.0).abs() < 1e-6);
}

#[test]
fn the_measured_run_ends_just_under_the_ceiling() {
    // 3.306 GB written of a 3.336 GB stage: 99.1 %, held below 100 % until StateFlags 4.
    let r = reading_from_write_delta(3_306_144_719, TO_STAGE, TO_DOWNLOAD).unwrap();
    assert!(r.bytes_done < r.bytes_total);
    assert!((r.bytes_done / r.bytes_total - MAX_FRACTION).abs() < 1e-9);
}

#[test]
fn over_counting_is_clamped_below_one_hundred_percent() {
    let r = reading_from_write_delta(TO_STAGE * 10, TO_STAGE, TO_DOWNLOAD).unwrap();
    assert!(r.bytes_done < r.bytes_total);
    assert!((r.bytes_done / r.bytes_total - MAX_FRACTION).abs() < 1e-9);
}

#[test]
fn nothing_written_is_zero_not_none() {
    let r = reading_from_write_delta(0, TO_STAGE, TO_DOWNLOAD).unwrap();
    assert_eq!(r.bytes_done, 0.0);
    assert_eq!(r.bytes_total, TO_DOWNLOAD as f64);
}

#[test]
fn without_a_download_size_the_stage_size_is_both_denominator_and_scale() {
    let r = reading_from_write_delta(500, 1_000, 0).unwrap();
    assert_eq!(r.bytes_total, 1_000.0);
    assert!((r.bytes_done - 500.0).abs() < 1e-9);
}

#[test]
fn without_a_stage_size_the_download_size_is_the_denominator() {
    let r = reading_from_write_delta(500, 0, 1_000).unwrap();
    assert_eq!(r.bytes_total, 1_000.0);
    assert!((r.bytes_done - 500.0).abs() < 1e-9);
}

#[test]
fn the_setup_write_with_no_totals_has_no_reading() {
    assert_eq!(reading_from_write_delta(123, 0, 0), None);
}

// ---- WindowsLiveSource -----------------------------------------------------------------------

/// A source that answers the scripted samples in order, then `None`.
fn scripted(
    samples: Vec<Option<CounterSample>>,
) -> Arc<dyn Fn() -> Option<CounterSample> + Send + Sync> {
    let queue = Arc::new(Mutex::new(VecDeque::from(samples)));
    Arc::new(move || queue.lock().unwrap().pop_front().flatten())
}

#[test]
fn a_disabled_source_never_answers() {
    let s = WindowsLiveSource::disabled();
    assert!(!s.is_enabled());
    assert_eq!(s.read("730", TO_STAGE, TO_DOWNLOAD), None);
}

#[test]
fn reads_climb_from_the_first_read_and_end_with_the_baseline_taken_at_the_first() {
    let s = WindowsLiveSource::with_source(scripted(vec![
        sample(10, 5_000),
        sample(10, 5_000 + TO_STAGE / 10),
        sample(10, 5_000 + TO_STAGE / 2),
    ]));
    let first = s.read("730", TO_STAGE, TO_DOWNLOAD).unwrap();
    assert_eq!(first.bytes_done, 0.0);
    let tenth = s.read("730", TO_STAGE, TO_DOWNLOAD).unwrap();
    assert!((tenth.bytes_done / tenth.bytes_total - 0.1).abs() < 1e-6);
    let half = s.read("730", TO_STAGE, TO_DOWNLOAD).unwrap();
    assert!((half.bytes_done / half.bytes_total - 0.5).abs() < 1e-6);
}

#[test]
fn each_app_id_keeps_its_own_baseline() {
    let s = WindowsLiveSource::with_source(scripted(vec![
        sample(10, 1_000),
        sample(10, 1_000 + TO_STAGE / 2),
        sample(10, 1_000 + TO_STAGE / 2),
    ]));
    s.read("111", TO_STAGE, TO_DOWNLOAD).unwrap();
    s.read("111", TO_STAGE, TO_DOWNLOAD).unwrap();
    // A second poll joins later: its baseline is the counter at ITS first read.
    let late = s.read("222", TO_STAGE, TO_DOWNLOAD).unwrap();
    assert_eq!(late.bytes_done, 0.0);
}

#[test]
fn stop_forgets_the_baseline() {
    let s = WindowsLiveSource::with_source(scripted(vec![
        sample(10, 1_000),
        sample(10, 1_000 + TO_STAGE / 2),
        sample(10, 1_000 + TO_STAGE / 2),
        sample(10, 1_000 + TO_STAGE / 2),
    ]));
    s.read("730", TO_STAGE, TO_DOWNLOAD).unwrap();
    assert!(s.read("730", TO_STAGE, TO_DOWNLOAD).unwrap().bytes_done > 0.0);
    s.stop("730");
    assert_eq!(
        s.read("730", TO_STAGE, TO_DOWNLOAD).unwrap().bytes_done,
        0.0
    );
    s.stop_all();
    assert_eq!(
        s.read("730", TO_STAGE, TO_DOWNLOAD).unwrap().bytes_done,
        0.0
    );
}

#[test]
fn an_unreadable_steam_before_any_sample_falls_back_to_the_acf() {
    let s = WindowsLiveSource::with_source(scripted(vec![None, None]));
    assert_eq!(s.read("730", TO_STAGE, TO_DOWNLOAD), None);
    assert_eq!(s.read("730", TO_STAGE, TO_DOWNLOAD), None);
}

#[test]
fn zero_totals_give_no_reading_but_still_take_the_baseline() {
    let s = WindowsLiveSource::with_source(scripted(vec![
        sample(10, 1_000),
        sample(10, 1_000 + TO_STAGE / 2),
    ]));
    // The setup tick (StateFlags 2, all zeros).
    assert_eq!(s.read("730", 0, 0), None);
    // The next tick carries the totals; the baseline is the setup tick's sample.
    let r = s.read("730", TO_STAGE, TO_DOWNLOAD).unwrap();
    assert!((r.bytes_done / r.bytes_total - 0.5).abs() < 1e-6);
}

// ---- DownloadMonitor integration -------------------------------------------------------------

fn monitor_with(source: Arc<dyn Fn() -> Option<CounterSample> + Send + Sync>) -> DownloadMonitor {
    let host: Arc<dyn PollHost> = Arc::new(RecordingHost::new(AckMode::Reply(Default::default())));
    let runner: Arc<dyn ProcessRunner> = Arc::new(ScriptedRunner::default());
    let clock: Arc<dyn Clock> = Arc::new(FakeClock::new(1_000_000));
    DownloadMonitor::with_platform(host, runner, clock, false).with_windows_source(source)
}

#[test]
fn the_monitor_serves_the_windows_reading_and_stop_resets_it() {
    let m = monitor_with(scripted(vec![
        sample(10, 100),
        sample(10, 100 + TO_STAGE / 2),
        sample(10, 100 + TO_STAGE / 2),
    ]));
    assert_eq!(
        m.read_windows("730", TO_STAGE, TO_DOWNLOAD)
            .unwrap()
            .bytes_done,
        0.0
    );
    assert!(
        m.read_windows("730", TO_STAGE, TO_DOWNLOAD)
            .unwrap()
            .bytes_done
            > 0.0
    );
    m.stop("730");
    assert_eq!(
        m.read_windows("730", TO_STAGE, TO_DOWNLOAD)
            .unwrap()
            .bytes_done,
        0.0
    );
}

#[test]
fn a_monitor_built_without_a_source_has_no_windows_reading() {
    let host: Arc<dyn PollHost> = Arc::new(RecordingHost::new(AckMode::Reply(Default::default())));
    let runner: Arc<dyn ProcessRunner> = Arc::new(ScriptedRunner::default());
    let clock: Arc<dyn Clock> = Arc::new(FakeClock::new(1_000_000));
    let m = DownloadMonitor::with_platform(host, runner, clock, false);
    assert_eq!(m.read_windows("730", TO_STAGE, TO_DOWNLOAD), None);
}

// ---- image names -----------------------------------------------------------------------------

fn wide(s: &str, len: usize) -> Vec<u16> {
    let mut v: Vec<u16> = s.encode_utf16().collect();
    v.resize(len, 0);
    v
}

#[test]
fn image_names_match_exactly_and_ignore_ascii_case() {
    assert!(wide_image_name_is(&wide("steam.exe", 260), "steam.exe"));
    assert!(wide_image_name_is(&wide("Steam.EXE", 260), "steam.exe"));
    assert!(!wide_image_name_is(
        &wide("steamwebhelper.exe", 260),
        "steam.exe"
    ));
    assert!(!wide_image_name_is(
        &wide("steam.exe.bak", 260),
        "steam.exe"
    ));
    assert!(!wide_image_name_is(&wide("", 260), "steam.exe"));
    // No NUL terminator at all: the whole buffer is the name.
    assert!(wide_image_name_is(&wide("steam.exe", 9), "steam.exe"));
}

// ---- the real Win32 reads, against this process ----------------------------------------------

#[cfg(windows)]
mod real_win32 {
    use gamelib_steampoll::win_live::sys::{pids_by_image_name, process_write_bytes};

    #[test]
    fn a_process_write_counter_rises_with_the_bytes_it_writes() {
        let pid = std::process::id();
        let before = process_write_bytes(pid).expect("own write counter");
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("payload.bin"), vec![7u8; 4 * 1024 * 1024]).unwrap();
        let after = process_write_bytes(pid).expect("own write counter");
        assert!(
            after >= before + 4 * 1024 * 1024,
            "WriteTransferCount rose {} for a 4 MiB write",
            after.saturating_sub(before)
        );
    }

    #[test]
    fn an_exited_or_invalid_pid_has_no_counter() {
        // Pid 0 is the System Idle Process: never openable. A pid at the top of the range is free.
        assert_eq!(process_write_bytes(0), None);
        assert_eq!(process_write_bytes(u32::MAX - 3), None);
    }

    #[test]
    fn the_snapshot_finds_this_process_by_its_image_name() {
        let exe = std::env::current_exe().unwrap();
        let name = exe.file_name().unwrap().to_string_lossy().into_owned();
        let pids = pids_by_image_name(&name);
        assert!(
            pids.contains(&std::process::id()),
            "{name} not found among {pids:?}"
        );
        assert!(pids.windows(2).all(|w| w[0] < w[1]), "ascending");
        assert!(pids_by_image_name("definitely-not-a-process.exe").is_empty());
    }
}
