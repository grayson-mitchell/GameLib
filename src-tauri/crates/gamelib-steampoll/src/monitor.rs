//! Port of steamDownloadMonitor.ts and the childWatchdog.ts spawn shape. Ported by plan 06.
//!
//! One `nettop` child per polled appId (macOS only) counts steam_osx's per-flow `bytes_in`, and an
//! incremental content_log.txt tail supplies the `update started` anchor. `read` returns `None`
//! on every guard failure so the poll falls back to ACF progress.
//!
//! Child ownership (D-07): Rust spawns argv-only with no env (nettop reads no user profile, so
//! the two-profile rule has no real-profile arm). The child is the `/bin/sh` watchdog, anchored on
//! the shell pid from `PollHost::shell_pid`, never on this process. `stop`/`stop_all` cancel the
//! child's kill token, and `kill_on_drop` in the runner backs that up.
//!
//! Windows has no nettop. `read_windows` serves the Windows live source (`win_live.rs`: steam.exe's
//! cumulative write counter) through the same monitor object, so the install loop's `stop` and
//! `stop_all` clean up both and the macOS path above is untouched.

use crate::acf_state::PollRoots;
use crate::host::{Clock, PollHost, ProcessRunner};
use crate::progress::{
    active_count, apply_content_log_event, apply_nettop_row, parse_content_log_line,
    parse_nettop_row, window_rate, FlowAccumulator, NettopRow, Sample, UpdateTracker,
};
use crate::win_live::{CounterSource, WindowsLiveSource};
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

pub const MAX_TAIL_BYTES: u64 = 256 * 1024;
pub const SAMPLE_RING_MS: f64 = 5000.0;

/// Constant script; copied byte for byte from childWatchdog.ts. Pids and the inner argv travel as
/// positional parameters and are never interpolated into this text (T-80-15).
pub const WATCHDOG_SH: &str = r#"p=$1; w=$2; shift 2
"$@" &
m=$!
g=
s=
cleanup() {
  c=$(pgrep -P "$m" 2>/dev/null)
  [ -n "$c" ] && g=$c
  [ -n "$s" ] && kill "$s" 2>/dev/null
  [ -n "$g" ] && kill $g 2>/dev/null
  kill "$m" 2>/dev/null
  exit 0
}
trap cleanup TERM INT HUP
while kill -0 "$p" 2>/dev/null && kill -0 "$m" 2>/dev/null && kill -0 "$w" 2>/dev/null; do
  c=$(pgrep -P "$m" 2>/dev/null)
  [ -n "$c" ] && g=$c
  sleep 1 &
  s=$!
  wait "$s"
done
cleanup
"#;

/// `(program, argv)` of the watchdog: `/bin/sh -c WATCHDOG_SH gamelib-watchdog <parent> <watch> inner...`.
pub fn build_watchdog_spawn(
    parent_pid: u32,
    watch_pid: u32,
    inner: &[String],
) -> (String, Vec<String>) {
    let mut args = vec![
        "-c".to_string(),
        WATCHDOG_SH.to_string(),
        "gamelib-watchdog".to_string(),
        parent_pid.to_string(),
        watch_pid.to_string(),
    ];
    args.extend(inner.iter().cloned());
    ("/bin/sh".to_string(), args)
}

fn inner_argv(steam_pid: u32) -> Vec<String> {
    [
        "/usr/bin/script",
        "-q",
        "/dev/null",
        "/usr/bin/nettop",
        "-x",
        "-n",
        "-L",
        "0",
        "-s",
        "1",
        "-J",
        "bytes_in",
        "-p",
    ]
    .iter()
    .map(|s| (*s).to_string())
    .chain(std::iter::once(steam_pid.to_string()))
    .collect()
}

/// Appended tail of content_log.txt: `(text, new offset)`. `offset: None` is the first read, which
/// starts at most `MAX_TAIL_BYTES` from the end and drops the partial first line.
pub fn read_content_log_tail(path: &Path, offset: Option<u64>) -> std::io::Result<(String, u64)> {
    let mut f = std::fs::File::open(path)?;
    let size = f.metadata()?.len();
    let mut drop_first = false;
    let start = match offset {
        None => {
            let s = size.saturating_sub(MAX_TAIL_BYTES);
            drop_first = s > 0;
            s
        }
        Some(o) if size < o => 0, // rotated
        Some(o) => o,
    };
    let len = MAX_TAIL_BYTES.min(size.saturating_sub(start));
    if len == 0 {
        return Ok((String::new(), start));
    }
    f.seek(SeekFrom::Start(start))?;
    let mut buf = vec![0u8; len as usize];
    f.read_exact(&mut buf)?;
    let mut text = String::from_utf8_lossy(&buf).into_owned();
    if drop_first {
        text = match text.find('\n') {
            Some(nl) => text[nl + 1..].to_string(),
            None => String::new(),
        };
    }
    Ok((text, start + len))
}

/// `<steamRoot>/logs/content_log.txt` (steamProcesses.ts: `defaultSteamPath` minus `'`).
pub fn content_log_path(roots: &PollRoots) -> PathBuf {
    PathBuf::from(roots.steam_root.replace('\'', ""))
        .join("logs")
        .join("content_log.txt")
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DownloadReading {
    pub bytes_done: f64,
    pub bytes_total: f64,
    pub speed_bytes_per_sec: Option<f64>,
}

struct Monitor {
    kill: Option<CancellationToken>,
    acc: FlowAccumulator,
    tracker: UpdateTracker,
    samples: Vec<Sample>,
    log_path: PathBuf,
    log_offset: Option<u64>,
    log_carry: String,
    failed: bool,
    stopped: bool,
}

type Shared = Arc<Mutex<Monitor>>;

fn lock(m: &Shared) -> MutexGuard<'_, Monitor> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn scan_log(m: &mut Monitor) {
    let Ok((text, offset)) = read_content_log_tail(&m.log_path, m.log_offset) else {
        return;
    };
    m.log_offset = Some(offset);
    if text.is_empty() {
        return;
    }
    let joined = format!("{}{}", m.log_carry, text);
    let mut parts: Vec<&str> = joined.split('\n').collect();
    let carry = parts.pop().unwrap_or_default().to_string();
    for line in parts {
        if let Some(ev) = parse_content_log_line(line) {
            let cum = m.acc.cum;
            apply_content_log_event(&mut m.tracker, &ev, cum);
        }
    }
    m.log_carry = carry;
}

fn kill_monitor(m: &Shared) {
    let mut g = lock(m);
    g.stopped = true;
    if let Some(k) = g.kill.take() {
        k.cancel();
    }
}

pub struct DownloadMonitor {
    host: Arc<dyn PollHost>,
    runner: Arc<dyn ProcessRunner>,
    clock: Arc<dyn Clock>,
    darwin: bool,
    monitors: Mutex<HashMap<String, Shared>>,
    /// The Windows live source: disabled unless this is a Windows build or a test injects one.
    win: WindowsLiveSource,
    /// Parity replay: a reading the harness supplies instead of nettop rows (plan 17).
    #[cfg(any(test, feature = "testing"))]
    injected: Mutex<HashMap<String, Option<DownloadReading>>>,
}

impl DownloadMonitor {
    pub fn new(
        host: Arc<dyn PollHost>,
        runner: Arc<dyn ProcessRunner>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        let mut monitor = Self::with_platform(host, runner, clock, cfg!(target_os = "macos"));
        monitor.win = WindowsLiveSource::system();
        monitor
    }

    /// `darwin` overrides the platform guard (tests). The Windows live source is disabled here, so
    /// no test reads a real process unless it injects a source with [`Self::with_windows_source`].
    pub fn with_platform(
        host: Arc<dyn PollHost>,
        runner: Arc<dyn ProcessRunner>,
        clock: Arc<dyn Clock>,
        darwin: bool,
    ) -> Self {
        DownloadMonitor {
            host,
            runner,
            clock,
            darwin,
            monitors: Mutex::new(HashMap::new()),
            win: WindowsLiveSource::disabled(),
            #[cfg(any(test, feature = "testing"))]
            injected: Mutex::new(HashMap::new()),
        }
    }

    /// Replaces the Windows live source's counter reader (tests; production uses the real one).
    pub fn with_windows_source(mut self, source: Arc<CounterSource>) -> Self {
        self.win = WindowsLiveSource::with_source(source);
        self
    }

    /// Makes `read(app_id)` answer `reading` (`None` = no reading) without a nettop child. The
    /// monitor internals are covered by plan 06's tests; this lets the replay feed the loop the
    /// timeline's `monitor` field.
    #[cfg(any(test, feature = "testing"))]
    pub fn inject_reading(&self, app_id: &str, reading: Option<DownloadReading>) {
        self.injected
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(app_id.to_string(), reading);
    }

    fn map(&self) -> MutexGuard<'_, HashMap<String, Shared>> {
        self.monitors.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// `pgrep -x steam_osx` pids; `None` when unknown (listSteamClientPids, darwin).
    async fn list_pids(&self) -> Option<Vec<u32>> {
        let out = self
            .runner
            .run(
                "/usr/bin/pgrep",
                vec!["-x".into(), "steam_osx".into()],
                Duration::from_secs(5),
            )
            .await;
        match out.code {
            Some(1) => Some(vec![]),
            Some(0) => Some(
                out.stdout
                    .lines()
                    .filter_map(|l| {
                        let t = l.trim();
                        if t.is_empty() || !t.bytes().all(|b| b.is_ascii_digit()) {
                            return None;
                        }
                        t.parse::<u32>().ok().filter(|p| *p > 0)
                    })
                    .collect(),
            ),
            _ => None,
        }
    }

    /// Starts the monitor for `app_id` (idempotent). Never fails; a spawn error marks it failed.
    /// Must run inside a tokio runtime.
    pub async fn start(&self, app_id: &str, roots: &PollRoots) {
        if !self.darwin {
            return;
        }
        let m: Shared = Arc::new(Mutex::new(Monitor {
            kill: None,
            acc: FlowAccumulator::new(),
            tracker: UpdateTracker::new(),
            samples: vec![],
            log_path: content_log_path(roots),
            log_offset: None,
            log_carry: String::new(),
            failed: false,
            stopped: false,
        }));
        // Registered before the first await so concurrent starts stay idempotent. A failed entry
        // (its child exited, e.g. the watched steam_osx died in a Steam restart, or the spawn
        // failed) is replaced rather than kept, or live progress would stay lost for the rest
        // of the poll (80-REVIEW A/WR-09).
        {
            let mut map = self.map();
            if let Some(existing) = map.get(app_id) {
                if !lock(existing).failed {
                    return;
                }
                kill_monitor(existing);
            }
            map.insert(app_id.to_string(), m.clone());
        }
        let pids = self.list_pids().await;
        let still_ours = self.map().get(app_id).is_some_and(|x| Arc::ptr_eq(x, &m));
        if lock(&m).stopped || !still_ours {
            return;
        }
        let Some(pid) = pids.as_ref().and_then(|p| p.iter().min().copied()) else {
            self.map().remove(app_id);
            return;
        };
        scan_log(&mut lock(&m));
        let (file, args) = build_watchdog_spawn(self.host.shell_pid(), pid, &inner_argv(pid));
        // No env: nettop reads no user profile.
        match self.runner.spawn_streaming(&file, args) {
            Ok(child) => {
                {
                    let mut g = lock(&m);
                    if g.stopped {
                        child.kill.cancel();
                        return;
                    }
                    g.kill = Some(child.kill.clone());
                }
                let clock = self.clock.clone();
                let mut lines = child.lines;
                let task_m = m.clone();
                tokio::spawn(async move {
                    while let Some(line) = lines.recv().await {
                        let Some(row) = parse_nettop_row(&line) else {
                            continue;
                        };
                        let mut g = lock(&task_m);
                        if g.stopped {
                            break;
                        }
                        if row == NettopRow::Header && g.acc.blocks >= 1 {
                            // The previous block is complete: sample it and re-read the log.
                            let ms = clock.now_ms() as f64;
                            let cum = g.acc.cum;
                            g.samples.push(Sample { ms, cum });
                            while g
                                .samples
                                .first()
                                .is_some_and(|o| ms - o.ms > SAMPLE_RING_MS)
                            {
                                g.samples.remove(0);
                            }
                            scan_log(&mut g);
                        }
                        apply_nettop_row(&mut g.acc, &row);
                    }
                    // The child's stdout closed: it exited or was killed.
                    lock(&task_m).failed = true;
                });
            }
            Err(_) => lock(&m).failed = true,
        }
    }

    /// Live reading for `app_id`, or `None` when the poller must use the ACF as before.
    pub fn read(&self, app_id: &str) -> Option<DownloadReading> {
        #[cfg(any(test, feature = "testing"))]
        if let Some(r) = self
            .injected
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(app_id)
        {
            return *r;
        }
        let m = self.map().get(app_id).cloned()?;
        let g = lock(&m);
        if g.failed || g.stopped || g.kill.is_none() || g.acc.blocks < 2 {
            return None;
        }
        if active_count(&g.tracker) != 1 {
            return None;
        }
        let upd = g.tracker.active.get(app_id)?;
        let bytes_done = upd.download_done + (g.acc.cum - upd.cum_at_start).max(0.0);
        Some(DownloadReading {
            bytes_done,
            bytes_total: upd.download_total,
            speed_bytes_per_sec: window_rate(&g.samples, self.clock.now_ms() as f64),
        })
    }

    /// Windows live reading for `app_id` against the ACF's current `BytesToStage` and
    /// `BytesToDownload`, or `None` when the poller must use the ACF as before (not a Windows
    /// build, Steam unreadable, or the ACF has no totals yet). The first call for an appId takes
    /// the write-counter baseline, so the loop calls it only while the ACF is downloading.
    pub fn read_windows(
        &self,
        app_id: &str,
        bytes_to_stage: u64,
        bytes_to_download: u64,
    ) -> Option<DownloadReading> {
        self.win.read(app_id, bytes_to_stage, bytes_to_download)
    }

    /// Whether a monitor for `app_id` is registered and has not failed (it may still be looking
    /// up the Steam pid). The install loop restarts a monitor that is not live.
    pub fn is_live(&self, app_id: &str) -> bool {
        self.map().get(app_id).is_some_and(|m| !lock(m).failed)
    }

    pub fn stop(&self, app_id: &str) {
        self.win.stop(app_id);
        let m = self.map().remove(app_id);
        if let Some(m) = m {
            kill_monitor(&m);
        }
    }

    pub fn stop_all(&self) {
        self.win.stop_all();
        let all: Vec<Shared> = self.map().drain().map(|(_, m)| m).collect();
        for m in all {
            kill_monitor(&m);
        }
    }
}
