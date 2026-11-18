//! Windows live progress for a download the Steam client performs itself (debug
//! `win-steam-handoff-progress-zero`).
//!
//! macOS reads steam_osx's per-flow `bytes_in` through nettop (`monitor.rs`). Windows had nothing
//! comparable, and Windows Steam does not help: for a `steam://install` download it writes the ACF
//! byte fields at setup (StateFlags 2, then 1026 with `BytesToDownload` and `BytesToStage`) and
//! rewrites them only at the end, so the ACF fallback read 0 % for the whole download.
//!
//! Measured on Windows 11 (two live handoff installs, 2026-11-19):
//!
//! - Banner Saga (237990), 3.18 GB download, 3.34 GB staged: the staging directory is preallocated
//!   (3.13 GB at the first tick), so its size is useless. steam.exe's cumulative I/O
//!   `WriteTransferCount` rose 3.306 GB from the first downloading tick to the commit, steadily at
//!   about 15 MB/s, 99.1 % of `BytesToStage`.
//! - Californium (402060), 348.7 MB download, 1.03 GB staged: the counter rose 1.03 GB, the stage
//!   size again, and not the (compressed) download size.
//!
//! So progress is the counter's growth since the poll's first downloading observation, over
//! `BytesToStage`, rescaled to the download size so the byte figures the UI shows stay on the scale
//! Steam itself reports.
//!
//! The counter is process-wide, so concurrent Steam writes (a second queued download, cloud sync)
//! inflate it; the fraction is therefore clamped below 100 %, which only StateFlags bit 4 grants
//! (the step's own live clamp does the same, `install_once.rs`).
//!
//! The math here is pure. The only OS call is [`sys`], compiled on Windows only and injected
//! behind [`CounterSource`] so every test runs without a real Steam.
//!
//! Linux stays ACF-only: Linux Steam is not measured here.

use crate::monitor::DownloadReading;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

/// The fraction never reaches 1: 100 % comes only from the installed branch (StateFlags bit 4).
pub const MAX_FRACTION: f64 = 0.99;

/// The image name of the Steam client process.
pub const STEAM_IMAGE_NAME: &str = "steam.exe";

/// One reading of the Steam client's cumulative write counter.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CounterSample {
    pub pid: u32,
    pub write_bytes: u64,
}

/// Where a sample comes from. `None` means unreadable (Steam not running, or access denied).
pub type CounterSource = dyn Fn() -> Option<CounterSample> + Send + Sync;

/// The span of one Steam process: its counter at the first sample and at the latest.
#[derive(Debug, Clone, Copy)]
struct Segment {
    pid: u32,
    base: u64,
    last: u64,
}

impl Segment {
    fn written(&self) -> u64 {
        self.last.saturating_sub(self.base)
    }
}

/// Bytes Steam wrote since one poll started watching, across Steam restarts.
///
/// The baseline is the first sample. A new pid (Steam restarted mid-download) closes the current
/// segment and starts another one, so the total never moves backwards; a counter that goes
/// backwards on the same pid (a recycled pid) is treated the same way. An unreadable sample holds
/// the last total rather than dropping to `None`, so one failed read does not snap the percent
/// back to 0 and Steam exiting freezes it, which the step then reports as paused.
#[derive(Debug, Clone, Default)]
pub struct WriteCounterTracker {
    segment: Option<Segment>,
    /// Bytes written by Steam processes that are no longer the current one.
    carried: u64,
}

impl WriteCounterTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Whether a sample has ever been readable (the baseline exists).
    pub fn has_baseline(&self) -> bool {
        self.segment.is_some()
    }

    /// Feeds one sample (or its absence) and answers the bytes written since the baseline.
    /// `None` only while no sample has ever been readable.
    pub fn observe(&mut self, sample: Option<CounterSample>) -> Option<u64> {
        if let Some(s) = sample {
            match &mut self.segment {
                Some(seg) if seg.pid == s.pid && s.write_bytes >= seg.last => {
                    seg.last = s.write_bytes;
                }
                Some(seg) => {
                    self.carried = self.carried.saturating_add(seg.written());
                    *seg = Segment {
                        pid: s.pid,
                        base: s.write_bytes,
                        last: s.write_bytes,
                    };
                }
                None => {
                    self.segment = Some(Segment {
                        pid: s.pid,
                        base: s.write_bytes,
                        last: s.write_bytes,
                    });
                }
            }
        }
        self.segment
            .map(|seg| self.carried.saturating_add(seg.written()))
    }
}

/// The reading for `written` bytes of Steam writes against this ACF's totals, or `None` when the
/// ACF has no totals yet (the setup write carries zeros).
///
/// The fraction is `written / BytesToStage` (`BytesToDownload` when there is no stage size),
/// clamped to [`MAX_FRACTION`]. The reading's bytes are that fraction of `BytesToDownload`
/// (`BytesToStage` when there is no download size), which is the scale the step's `live_progress`
/// takes its total from, so the percent, the byte figure and the ETA all agree.
pub fn reading_from_write_delta(
    written: u64,
    bytes_to_stage: u64,
    bytes_to_download: u64,
) -> Option<DownloadReading> {
    let fraction_of = if bytes_to_stage > 0 {
        bytes_to_stage
    } else {
        bytes_to_download
    };
    let scale_to = if bytes_to_download > 0 {
        bytes_to_download
    } else {
        bytes_to_stage
    };
    if fraction_of == 0 || scale_to == 0 {
        return None;
    }
    let fraction = (written as f64 / fraction_of as f64).clamp(0.0, MAX_FRACTION);
    Some(DownloadReading {
        bytes_done: fraction * scale_to as f64,
        bytes_total: scale_to as f64,
        // The step derives speed from consecutive ticks' bytes.
        speed_bytes_per_sec: None,
    })
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Logging rule (T-28-04): appId and kind only.
fn log_line(message: &str) {
    eprintln!("gamelib-steampoll: {message}");
}

/// One appId's baseline, and whether its unreadable-Steam note was already logged.
#[derive(Default)]
struct Entry {
    tracker: WriteCounterTracker,
    warned_unreadable: bool,
}

/// Per-appId trackers over one [`CounterSource`].
pub struct WindowsLiveSource {
    source: Option<Arc<CounterSource>>,
    trackers: Mutex<HashMap<String, Entry>>,
}

impl WindowsLiveSource {
    /// Never answers (every non-Windows build, and every test that does not inject a source).
    pub fn disabled() -> Self {
        Self {
            source: None,
            trackers: Mutex::new(HashMap::new()),
        }
    }

    /// Reads steam.exe on Windows; disabled everywhere else.
    pub fn system() -> Self {
        #[cfg(windows)]
        {
            Self::with_source(Arc::new(sys::steam_write_counter))
        }
        #[cfg(not(windows))]
        {
            Self::disabled()
        }
    }

    pub fn with_source(source: Arc<CounterSource>) -> Self {
        Self {
            source: Some(source),
            trackers: Mutex::new(HashMap::new()),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.source.is_some()
    }

    /// The live reading for `app_id` against the ACF's current totals. The first call for an appId
    /// takes its baseline, so call it from the poll's first downloading observation on.
    pub fn read(
        &self,
        app_id: &str,
        bytes_to_stage: u64,
        bytes_to_download: u64,
    ) -> Option<DownloadReading> {
        let source = self.source.as_ref()?;
        // Sampled outside the lock: a ToolHelp snapshot is a few ms.
        let sample = source();
        let mut map = lock(&self.trackers);
        let entry = map.entry(app_id.to_string()).or_default();
        let had_baseline = entry.tracker.has_baseline();
        let written = entry.tracker.observe(sample);
        // One line each way per poll, so a live run shows which source drove the percent.
        if !had_baseline && written.is_some() {
            log_line(&format!(
                "windows live progress started for appId {app_id} (steam.exe write counter)"
            ));
        } else if !had_baseline && !entry.warned_unreadable {
            entry.warned_unreadable = true;
            log_line(&format!(
                "windows live progress unavailable for appId {app_id}: steam.exe write counter unreadable, using the ACF alone"
            ));
        }
        reading_from_write_delta(written?, bytes_to_stage, bytes_to_download)
    }

    /// Forgets `app_id`'s baseline (its poll ended or stopped being eligible).
    pub fn stop(&self, app_id: &str) {
        lock(&self.trackers).remove(app_id);
    }

    pub fn stop_all(&self) {
        lock(&self.trackers).clear();
    }
}

/// `true` when the NUL-terminated UTF-16 image name `wide` equals `name`, ASCII case-insensitive
/// (`PROCESSENTRY32W::szExeFile` is a fixed buffer, NUL-padded).
pub fn wide_image_name_is(wide: &[u16], name: &str) -> bool {
    let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
    String::from_utf16_lossy(&wide[..end]).eq_ignore_ascii_case(name)
}

/// The Win32 reads behind [`WindowsLiveSource::system`].
#[cfg(windows)]
pub mod sys {
    use super::{wide_image_name_is, CounterSample, STEAM_IMAGE_NAME};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetProcessIoCounters, OpenProcess, IO_COUNTERS, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    /// Closes the wrapped handle on drop.
    struct Handle(HANDLE);

    impl Drop for Handle {
        fn drop(&mut self) {
            // SAFETY: the handle is non-null, valid and owned by this guard, and closed once.
            unsafe { CloseHandle(self.0) };
        }
    }

    /// The pids of every process whose image name is `name`, ascending.
    pub fn pids_by_image_name(name: &str) -> Vec<u32> {
        // SAFETY: a plain snapshot request; the result is checked before use.
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot.is_null() || snapshot == INVALID_HANDLE_VALUE {
            return Vec::new();
        }
        let snapshot = Handle(snapshot);
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..PROCESSENTRY32W::default()
        };
        let mut pids = Vec::new();
        // SAFETY: `snapshot` is a live snapshot handle and `entry` is a writable PROCESSENTRY32W
        // whose `dwSize` is set, as both calls require.
        let mut more = unsafe { Process32FirstW(snapshot.0, &mut entry) } != 0;
        while more {
            if wide_image_name_is(&entry.szExeFile, name) {
                pids.push(entry.th32ProcessID);
            }
            // SAFETY: as above.
            more = unsafe { Process32NextW(snapshot.0, &mut entry) } != 0;
        }
        pids.sort_unstable();
        pids
    }

    /// `WriteTransferCount` of `pid`: bytes it has written since it started. `None` when the
    /// process is gone or cannot be opened (an elevated Steam seen from a non-elevated GameLib).
    pub fn process_write_bytes(pid: u32) -> Option<u64> {
        // SAFETY: a plain open request with the least access the counter query needs; the result
        // is checked before use.
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if process.is_null() {
            return None;
        }
        let process = Handle(process);
        let mut counters = IO_COUNTERS::default();
        // SAFETY: `process` is a live handle with query access and `counters` is writable.
        let ok = unsafe { GetProcessIoCounters(process.0, &mut counters) };
        (ok != 0).then_some(counters.WriteTransferCount)
    }

    /// The write counter of the lowest-pid readable `steam.exe`, or `None` when none is.
    pub fn steam_write_counter() -> Option<CounterSample> {
        pids_by_image_name(STEAM_IMAGE_NAME)
            .into_iter()
            .find_map(|pid| {
                process_write_bytes(pid).map(|write_bytes| CounterSample { pid, write_bytes })
            })
    }
}
