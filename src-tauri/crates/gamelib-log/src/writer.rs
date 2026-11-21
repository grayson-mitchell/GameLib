//! The writer thread: one owner of every log file, fed by a bounded channel.
//!
//! Callers never block and never see an error: `log` and `submit_line` stamp, `try_send` and return.
//! A full channel drops the entry and counts it; the writer later logs how many were dropped. The
//! thread opens, appends and closes per batch (no held handle, so a Windows reader or a rename never
//! fights it) and runs every message under `catch_unwind`.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, SyncSender, TrySendError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use gamelib_core::clock::Clock;
use gamelib_core::paths::{log_file, LogTarget, Platform};

use crate::format::{format_line, normalise_chunk};
use crate::prefix::{Level, Prefix};

/// Ingest capacity. Past it a caller's entry is dropped and counted, never waited for.
const CHANNEL_CAPACITY: usize = 4096;

/// The local UTC offset, in minutes east, that applies at an instant.
pub trait TzOffset: Send + Sync + 'static {
    fn offset_minutes(&self, epoch_ms: u64) -> i32;
}

/// The system's local timezone at that instant.
pub struct SystemTz;

impl TzOffset for SystemTz {
    fn offset_minutes(&self, epoch_ms: u64) -> i32 {
        use chrono::{Local, Offset, TimeZone};
        Local
            .timestamp_millis_opt(epoch_ms as i64)
            .single()
            .map(|d| d.offset().fix().local_minus_utc() / 60)
            .unwrap_or(0)
    }
}

/// Everything the writer needs, injected: it reads no environment.
pub struct LogConfig {
    pub platform: Platform,
    pub log_dir: String,
    /// `gamelib_core::paths::resolve(..).user_data`, where the GOG redist log lives.
    pub user_data: String,
    pub clock: Arc<dyn Clock>,
    pub tz: Arc<dyn TzOffset>,
}

enum Msg {
    General {
        ts: u64,
        tz: i32,
        level: Level,
        prefix: Prefix,
        msg: String,
    },
    Flush(SyncSender<()>),
}

pub struct Logger {
    tx: SyncSender<Msg>,
    dropped: Arc<AtomicU64>,
    clock: Arc<dyn Clock>,
    tz: Arc<dyn TzOffset>,
}

impl Logger {
    pub fn start(cfg: LogConfig) -> Logger {
        let (tx, rx) = sync_channel(CHANNEL_CAPACITY);
        let dropped = Arc::new(AtomicU64::new(0));
        let clock = Arc::clone(&cfg.clock);
        let tz = Arc::clone(&cfg.tz);
        let mut state = WriterState::new(cfg, Arc::clone(&dropped));
        let spawned = std::thread::Builder::new()
            .name("gamelib-log-writer".to_string())
            .spawn(move || state.run(rx));
        // A failed spawn leaves the receiver dropped: every `log` then counts a drop, never errors.
        drop(spawned);
        Logger {
            tx,
            dropped,
            clock,
            tz,
        }
    }

    /// Stamps the entry with the clock and local offset now.
    pub fn log(&self, prefix: Prefix, level: Level, msg: &str) {
        let ts = self.clock.now_ms();
        let tz = self.tz.offset_minutes(ts);
        self.submit_line(ts, tz, level, prefix, msg);
    }

    /// An entry carrying its origin's own timestamp and offset.
    pub fn submit_line(&self, ts: u64, tz: i32, level: Level, prefix: Prefix, msg: &str) {
        self.send(Msg::General {
            ts,
            tz,
            level,
            prefix,
            msg: msg.to_string(),
        });
    }

    fn send(&self, msg: Msg) {
        if let Err(TrySendError::Full(_) | TrySendError::Disconnected(_)) = self.tx.try_send(msg) {
            self.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Waits (up to `within`) until everything submitted before this call is on disk.
    pub fn flush(&self, within: Duration) -> bool {
        let deadline = Instant::now() + within;
        let (ack_tx, ack_rx) = sync_channel(1);
        let mut msg = Msg::Flush(ack_tx);
        loop {
            match self.tx.try_send(msg) {
                Ok(()) => break,
                Err(TrySendError::Disconnected(_)) => return false,
                Err(TrySendError::Full(back)) => {
                    if Instant::now() >= deadline {
                        return false;
                    }
                    msg = back;
                    std::thread::sleep(Duration::from_millis(1));
                }
            }
        }
        let left = deadline.saturating_duration_since(Instant::now());
        ack_rx.recv_timeout(left).is_ok()
    }
}

struct WriterState {
    cfg: LogConfig,
    dropped: Arc<AtomicU64>,
    general_rotated: bool,
}

impl WriterState {
    fn new(cfg: LogConfig, dropped: Arc<AtomicU64>) -> WriterState {
        WriterState {
            cfg,
            dropped,
            general_rotated: false,
        }
    }

    fn run(&mut self, rx: Receiver<Msg>) {
        while let Ok(msg) = rx.recv() {
            if let Msg::Flush(ack) = msg {
                let _ = ack.try_send(());
                continue;
            }
            // A panic while handling one message must not end the writer.
            let _ = catch_unwind(AssertUnwindSafe(|| self.handle(msg)));
        }
    }

    fn handle(&mut self, msg: Msg) {
        self.report_drops();
        if let Msg::General {
            ts,
            tz,
            level,
            prefix,
            msg,
        } = msg
        {
            if let Some(line) = format_line(ts, tz, level, prefix, &msg) {
                self.append_general(&line);
            }
        }
    }

    fn report_drops(&mut self) {
        let n = self.dropped.swap(0, Ordering::Relaxed);
        if n == 0 {
            return;
        }
        let ts = self.cfg.clock.now_ms();
        let tz = self.cfg.tz.offset_minutes(ts);
        let body = format!("log writer: {n} lines dropped (ingest full)");
        if let Some(line) = format_line(ts, tz, Level::Warning, Prefix::Backend, &body) {
            self.append_general(&line);
        }
    }

    fn general_path(&self) -> Option<String> {
        log_file(
            self.cfg.platform,
            &self.cfg.log_dir,
            &self.cfg.user_data,
            &LogTarget::General,
        )
        .ok()
    }

    /// Appends one line to `gamelib.log`, rotating it to `gamelib.log.old` first on the Logger's
    /// first general write (an existing `.old` is replaced).
    fn append_general(&mut self, line: &str) {
        let Some(path) = self.general_path() else {
            return;
        };
        if !self.general_rotated {
            self.general_rotated = true;
            let _ = rotate(&path);
        }
        // The per-chunk rule applies to a formatted line too (a message ending in a newline).
        if let Some(data) = normalise_chunk(line) {
            let _ = append(&path, &data);
        }
    }
}

/// Renames `path` to `<path>.old` when it exists, replacing an existing `.old`.
fn rotate(path: &str) -> io::Result<()> {
    if !Path::new(path).exists() {
        return Ok(());
    }
    fs::rename(path, format!("{path}.old"))
}

/// One open-append-close. New files are created 0600 on unix (D-18); an existing file keeps its mode.
fn append(path: &str, data: &str) -> io::Result<()> {
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent)?;
    }
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(data.as_bytes())
}
