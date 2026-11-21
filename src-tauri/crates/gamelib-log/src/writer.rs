//! The writer thread: one owner of every log file, fed by a bounded channel.
//!
//! Callers never block and never see an error: `log` and `submit_line` stamp, `try_send` and return.
//! A full channel drops the entry and counts it; the writer later logs how many were dropped. The
//! thread opens, appends and closes per batch (no held handle, so a Windows reader or a rename never
//! fights it) and runs every message under `catch_unwind`.

use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use gamelib_core::clock::Clock;
use gamelib_core::paths::{log_file, LogPathError, LogTarget, Platform};

use crate::format::{format_line, normalise_chunk};
use crate::limiter::{RateLimiter, Summary};
use crate::prefix::{Level, Prefix};

/// Ingest capacity. Past it a caller's entry is dropped and counted, never waited for.
const CHANNEL_CAPACITY: usize = 4096;

/// How often an idle writer wakes to close the rate limiter's elapsed windows, so a log that goes
/// quiet still gets its summary (D-14).
const WRITER_TICK: Duration = Duration::from_secs(5);

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

/// One entry of a batch: a structured line (formatted by the writer) or a raw chunk (a child's
/// output, written as is subject to the per-chunk newline rule).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Entry {
    Line {
        ts: u64,
        tz: i32,
        level: Level,
        prefix: Prefix,
        msg: String,
    },
    Raw(String),
}

/// The entries one writer instance sent for one target. `rotate` is true when that instance's first
/// accepted entry arrives (never set for the general target: `gamelib.log` rotates once per Logger).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetBatch {
    pub target: LogTarget,
    pub rotate: bool,
    pub entries: Vec<Entry>,
}

enum Msg {
    Batches(Vec<TargetBatch>),
    /// Everything submitted before is on disk; every open rate-limit window is closed first.
    Flush(SyncSender<()>),
    /// The writer's periodic tick, run now (tests drive it from a scripted clock).
    Tick(SyncSender<()>),
    /// Test hook: park the writer thread until the sender side is dropped or signalled.
    #[cfg(test)]
    Hold(Receiver<()>),
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
        self.submit(vec![TargetBatch {
            target: LogTarget::General,
            rotate: false,
            entries: vec![Entry::Line {
                ts,
                tz,
                level,
                prefix,
                msg: msg.to_string(),
            }],
        }]);
    }

    /// One `try_send` per call, so a sidecar frame is all or nothing.
    pub fn submit(&self, batches: Vec<TargetBatch>) {
        self.send(Msg::Batches(batches));
    }

    /// Test hook: parks the writer thread until the returned sender is dropped.
    #[cfg(test)]
    fn hold(&self) -> std::sync::mpsc::Sender<()> {
        let (tx, rx) = std::sync::mpsc::channel();
        let _ = self.tx.send(Msg::Hold(rx));
        tx
    }

    fn send(&self, msg: Msg) {
        if let Err(TrySendError::Full(_) | TrySendError::Disconnected(_)) = self.tx.try_send(msg) {
            self.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Runs the writer's periodic tick now and waits for it (a barrier: everything submitted before
    /// this call has been handled, and the rate limiter's windows that have elapsed at the clock's
    /// time are closed). Exists so a test can drive the tick from a scripted clock.
    pub fn tick_for_tests(&self, within: Duration) -> bool {
        self.barrier(within, Msg::Tick)
    }

    /// Waits (up to `within`) until everything submitted before this call is on disk. Closes every
    /// open rate-limit window first, so its summary is part of what lands.
    pub fn flush(&self, within: Duration) -> bool {
        self.barrier(within, Msg::Flush)
    }

    fn barrier(&self, within: Duration, make: fn(SyncSender<()>) -> Msg) -> bool {
        let deadline = Instant::now() + within;
        let (ack_tx, ack_rx) = sync_channel(1);
        let mut msg = make(ack_tx);
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
    /// Paths whose failed rotation already logged its one WARNING.
    rotation_warned: HashSet<String>,
    /// Repeating `gamelib.log` lines only (D-14); transcripts never reach it (D-15).
    limiter: RateLimiter,
}

impl WriterState {
    fn new(cfg: LogConfig, dropped: Arc<AtomicU64>) -> WriterState {
        WriterState {
            cfg,
            dropped,
            general_rotated: false,
            rotation_warned: HashSet::new(),
            limiter: RateLimiter::new(),
        }
    }

    fn run(&mut self, rx: Receiver<Msg>) {
        loop {
            // A panic while handling one message must not end the writer.
            match rx.recv_timeout(WRITER_TICK) {
                Ok(msg) => {
                    let _ = catch_unwind(AssertUnwindSafe(|| self.handle(msg)));
                }
                Err(RecvTimeoutError::Timeout) => {
                    let _ = catch_unwind(AssertUnwindSafe(|| self.close_windows()));
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    }

    /// Writes the summary of every rate-limit window that has elapsed at the clock's time.
    fn close_windows(&mut self) {
        let summaries = self.limiter.expire(self.cfg.clock.now_ms());
        self.append_summaries(&summaries);
    }

    fn append_summaries(&mut self, summaries: &[Summary]) {
        for summary in summaries {
            if let Some(chunk) = self.summary_chunk(summary) {
                self.append_general_chunk(&chunk);
            }
        }
    }

    /// A summary as a normal line, stamped by the Logger's clock.
    fn summary_chunk(&self, summary: &Summary) -> Option<String> {
        let ts = self.cfg.clock.now_ms();
        let tz = self.cfg.tz.offset_minutes(ts);
        format_line(ts, tz, summary.level, summary.prefix, &summary.body)
            .and_then(|l| normalise_chunk(&l))
    }

    fn handle(&mut self, msg: Msg) {
        self.report_drops();
        self.close_windows();
        match msg {
            Msg::Batches(batches) => {
                for batch in batches {
                    self.write_batch(batch);
                }
            }
            Msg::Flush(ack) => {
                let summaries = self.limiter.drain();
                self.append_summaries(&summaries);
                let _ = ack.try_send(());
            }
            Msg::Tick(ack) => {
                let _ = ack.try_send(());
            }
            #[cfg(test)]
            Msg::Hold(rx) => while rx.recv().is_ok() {},
        }
    }

    fn report_drops(&mut self) {
        let n = self.dropped.swap(0, Ordering::Relaxed);
        if n == 0 {
            return;
        }
        self.general(
            Level::Warning,
            &format!("log writer: {n} lines dropped (ingest full)"),
        );
    }

    /// A line from the writer itself into `gamelib.log`, stamped by the Logger's clock.
    fn general(&mut self, level: Level, body: &str) {
        let ts = self.cfg.clock.now_ms();
        let tz = self.cfg.tz.offset_minutes(ts);
        if let Some(line) = format_line(ts, tz, level, Prefix::Backend, body) {
            self.append_general(&line);
        }
    }

    fn path_of(&self, target: &LogTarget) -> Result<String, LogPathError> {
        log_file(
            self.cfg.platform,
            &self.cfg.log_dir,
            &self.cfg.user_data,
            target,
        )
    }

    fn write_batch(&mut self, batch: TargetBatch) {
        let path = match self.path_of(&batch.target) {
            Ok(p) => p,
            Err(e) => {
                // The kind only: the rejected name may be hostile text.
                self.general(
                    Level::Warning,
                    &format!("log target rejected: {}", path_error_name(e)),
                );
                return;
            }
        };
        let is_general = batch.target == LogTarget::General;
        if !is_general && batch.rotate {
            if let Err(e) = rotate(&path) {
                if self.rotation_warned.insert(path.clone()) {
                    self.general(
                        Level::Warning,
                        &format!(
                            "log rotation failed for {}: {:?}",
                            target_kind(&batch.target),
                            e.kind()
                        ),
                    );
                }
            }
            self.general(Level::Debug, &format!("Logging to file(s) {path}"));
        }
        let mut data = String::new();
        for entry in &batch.entries {
            let chunk = match entry {
                Entry::Line {
                    ts,
                    tz,
                    level,
                    prefix,
                    msg,
                } => {
                    let line = format_line(*ts, *tz, *level, *prefix, msg)
                        .and_then(|l| normalise_chunk(&l));
                    // Only a general-target line is rate limited (D-14); a raw chunk or a line for
                    // any other target is a transcript and is never altered (D-15).
                    if is_general && line.is_some() {
                        self.limit(*ts, *level, *prefix, msg, &mut data, line)
                    } else {
                        line
                    }
                }
                Entry::Raw(text) => normalise_chunk(text),
            };
            if let Some(c) = chunk {
                data.push_str(&c);
            }
        }
        if data.is_empty() {
            return;
        }
        if is_general {
            self.rotate_general_once(&path);
        }
        // A failed append is dropped; it never re-rotates (that would archive what did land).
        let _ = append(&path, &data);
    }

    /// Runs one general-target line through the limiter: the summaries of windows that closed by the
    /// entry's own time go into `data` first (so they precede the entry that closed them), then the
    /// line itself if admitted, then the summary of any key its admission evicted (written after it).
    fn limit(
        &mut self,
        ts: u64,
        level: Level,
        prefix: Prefix,
        msg: &str,
        data: &mut String,
        line: Option<String>,
    ) -> Option<String> {
        for summary in self.limiter.expire(ts) {
            if let Some(chunk) = self.summary_chunk(&summary) {
                data.push_str(&chunk);
            }
        }
        let admitted = self.limiter.admit(ts, level, prefix, msg);
        let mut out = if admitted { line } else { None };
        for summary in self.limiter.take_evicted() {
            if let Some(chunk) = self.summary_chunk(&summary) {
                out.get_or_insert_with(String::new).push_str(&chunk);
            }
        }
        out
    }

    /// Rotates `gamelib.log` to `.old` once per Logger, on its first general write. A failed rename
    /// keeps appending and logs one WARNING.
    fn rotate_general_once(&mut self, path: &str) {
        if self.general_rotated {
            return;
        }
        self.general_rotated = true;
        if let Err(e) = rotate(path) {
            if self.rotation_warned.insert(path.to_string()) {
                let ts = self.cfg.clock.now_ms();
                let tz = self.cfg.tz.offset_minutes(ts);
                let body = format!("log rotation failed for general: {:?}", e.kind());
                if let Some(data) = format_line(ts, tz, Level::Warning, Prefix::Backend, &body)
                    .and_then(|l| normalise_chunk(&l))
                {
                    let _ = append(path, &data);
                }
            }
        }
    }

    /// Appends one line to `gamelib.log`.
    fn append_general(&mut self, line: &str) {
        // The per-chunk rule applies to a formatted line too (a message ending in a newline).
        let Some(data) = normalise_chunk(line) else {
            return;
        };
        self.append_general_chunk(&data);
    }

    /// Appends already-normalised text to `gamelib.log`.
    fn append_general_chunk(&mut self, data: &str) {
        let Ok(path) = self.path_of(&LogTarget::General) else {
            return;
        };
        self.rotate_general_once(&path);
        let _ = append(&path, data);
    }
}

fn target_kind(target: &LogTarget) -> &'static str {
    match target {
        LogTarget::General => "general",
        LogTarget::Runner(_) => "runner",
        LogTarget::Game { .. } => "game",
        LogTarget::GogRedist => "gogRedist",
    }
}

fn path_error_name(e: LogPathError) -> &'static str {
    match e {
        LogPathError::EmptySegment => "empty-segment",
        LogPathError::Separator => "separator",
        LogPathError::DotDot => "dot-dot",
        LogPathError::Nul => "nul",
        LogPathError::TooLong => "too-long",
        LogPathError::CometGame => "comet-game",
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

#[cfg(test)]
mod test_support {
    use super::*;
    use gamelib_core::paths::{join, GameLogType, LogRunner};
    use gamelib_testutil::FakeHome;

    /// 2026-11-20 13:05:09 at UTC+13.
    pub const TS: u64 = 1_795_133_109_000;

    pub struct FixedClock;
    impl Clock for FixedClock {
        fn now_ms(&self) -> u64 {
            TS
        }
    }

    pub struct FixedTz;
    impl TzOffset for FixedTz {
        fn offset_minutes(&self, _epoch_ms: u64) -> i32 {
            780
        }
    }

    pub fn config(home: &FakeHome) -> LogConfig {
        let root = home.root().to_string_lossy().into_owned();
        LogConfig {
            platform: Platform::current(),
            user_data: join(Platform::current(), &root, &["userData"]),
            log_dir: root,
            clock: Arc::new(FixedClock),
            tz: Arc::new(FixedTz),
        }
    }

    pub fn game(app: &str) -> LogTarget {
        LogTarget::Game {
            app_name: app.to_string(),
            runner: LogRunner::Steam,
            kind: GameLogType::Launch,
        }
    }

    pub fn raw(text: &str) -> Entry {
        Entry::Raw(text.to_string())
    }

    pub fn batch(target: LogTarget, rotate: bool, entries: Vec<Entry>) -> TargetBatch {
        TargetBatch {
            target,
            rotate,
            entries,
        }
    }

    pub fn path(home: &FakeHome, parts: &[&str]) -> String {
        join(Platform::current(), &home.root().to_string_lossy(), parts)
    }

    pub fn read(p: &str) -> String {
        fs::read_to_string(p).unwrap_or_default()
    }

    pub const GENEROUS: Duration = Duration::from_secs(10);
}

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::*;
    use gamelib_core::paths::LogRunner;
    use gamelib_testutil::FakeHome;

    #[test]
    fn a_game_batch_rotates_replaces_the_old_file_and_logs_the_path_into_gamelib_log() {
        let home = FakeHome::new("gamelib-log-");
        let launch = path(&home, &["games", "480_steam", "launch.log"]);
        fs::create_dir_all(Path::new(&launch).parent().unwrap()).unwrap();
        fs::write(&launch, "previous launch\n").unwrap();
        fs::write(format!("{launch}.old"), "two launches ago\n").unwrap();
        let logger = Logger::start(config(&home));
        logger.submit(vec![batch(game("480"), true, vec![raw("new launch\n")])]);
        assert!(logger.flush(GENEROUS));
        assert_eq!(read(&launch), "new launch\n");
        assert_eq!(read(&format!("{launch}.old")), "previous launch\n");
        assert_eq!(
            read(&path(&home, &["gamelib.log"])),
            format!("(13:05:09) [DEBUG]:   [Backend]:         Logging to file(s) {launch}\n")
        );
    }

    #[test]
    fn rotate_true_rotates_again_and_rotate_false_only_appends() {
        let home = FakeHome::new("gamelib-log-");
        let launch = path(&home, &["games", "480_steam", "launch.log"]);
        let logger = Logger::start(config(&home));
        logger.submit(vec![batch(game("480"), true, vec![raw("one\n")])]);
        logger.submit(vec![batch(game("480"), false, vec![raw("two\n")])]);
        assert!(logger.flush(GENEROUS));
        assert_eq!(read(&launch), "one\ntwo\n");
        logger.submit(vec![batch(game("480"), true, vec![raw("three\n")])]);
        assert!(logger.flush(GENEROUS));
        assert_eq!(read(&launch), "three\n");
        assert_eq!(read(&format!("{launch}.old")), "one\ntwo\n");
    }

    #[test]
    fn runner_and_gog_redist_targets_resolve_through_log_file() {
        let home = FakeHome::new("gamelib-log-");
        let logger = Logger::start(config(&home));
        logger.submit(vec![
            batch(
                LogTarget::Runner(LogRunner::Nile),
                true,
                vec![raw("runner\n")],
            ),
            batch(LogTarget::GogRedist, true, vec![raw("redist\n")]),
        ]);
        assert!(logger.flush(GENEROUS));
        assert_eq!(read(&path(&home, &["runners", "nile.log"])), "runner\n");
        assert_eq!(
            read(&path(&home, &["userData", "GamesConfig", "gog-redist.log"])),
            "redist\n"
        );
    }

    #[test]
    fn raw_entries_follow_the_per_chunk_rule_and_blank_ones_write_nothing() {
        let home = FakeHome::new("gamelib-log-");
        let launch = path(&home, &["games", "480_steam", "launch.log"]);
        let logger = Logger::start(config(&home));
        logger.submit(vec![batch(
            game("480"),
            true,
            vec![raw("first\n"), raw("middle without newline"), raw("last\n")],
        )]);
        logger.submit(vec![batch(
            game("480"),
            false,
            vec![raw("  \n\t"), raw("\u{feff}")],
        )]);
        assert!(logger.flush(GENEROUS));
        assert_eq!(read(&launch), "first\nmiddle without newline\nlast\n");
    }

    #[test]
    fn a_blank_only_batch_rotates_but_creates_no_file() {
        let home = FakeHome::new("gamelib-log-");
        let launch = path(&home, &["games", "480_steam", "launch.log"]);
        fs::create_dir_all(Path::new(&launch).parent().unwrap()).unwrap();
        fs::write(&launch, "previous\n").unwrap();
        let logger = Logger::start(config(&home));
        logger.submit(vec![batch(game("480"), true, vec![raw("   ")])]);
        assert!(logger.flush(GENEROUS));
        assert!(!Path::new(&launch).exists());
        assert_eq!(read(&format!("{launch}.old")), "previous\n");
    }

    #[test]
    fn gamelib_log_rotates_once_on_the_first_general_write() {
        let home = FakeHome::new("gamelib-log-");
        let general = path(&home, &["gamelib.log"]);
        fs::write(&general, "from the last launch\n").unwrap();
        let logger = Logger::start(config(&home));
        logger.log(Prefix::Backend, Level::Info, "one");
        logger.log(Prefix::Backend, Level::Info, "two");
        assert!(logger.flush(GENEROUS));
        assert_eq!(read(&format!("{general}.old")), "from the last launch\n");
        let body = read(&general);
        assert!(body.contains("one\n") && body.contains("two\n"));
        assert!(!body.contains("last launch"));
    }

    #[test]
    fn a_rejected_target_drops_the_batch_and_names_only_the_error_kind() {
        let home = FakeHome::new("gamelib-log-");
        let logger = Logger::start(config(&home));
        logger.submit(vec![batch(game(".."), true, vec![raw("x\n")])]);
        assert!(logger.flush(GENEROUS));
        let body = read(&path(&home, &["gamelib.log"]));
        assert!(body.contains("log target rejected: dot-dot"), "{body}");
        assert!(!Path::new(&path(&home, &["games"])).exists());
    }

    #[test]
    fn a_failed_rotation_logs_one_warning_per_target_and_still_appends() {
        let home = FakeHome::new("gamelib-log-");
        let launch = path(&home, &["games", "480_steam", "launch.log"]);
        fs::create_dir_all(Path::new(&launch).parent().unwrap()).unwrap();
        fs::write(&launch, "previous\n").unwrap();
        // A directory where the `.old` file would go makes the rename fail on every platform.
        fs::create_dir(format!("{launch}.old")).unwrap();
        fs::write(Path::new(&format!("{launch}.old")).join("held"), "x").unwrap();
        let logger = Logger::start(config(&home));
        for text in ["a\n", "b\n"] {
            logger.submit(vec![batch(game("480"), true, vec![raw(text)])]);
        }
        assert!(logger.flush(GENEROUS));
        assert_eq!(read(&launch), "previous\na\nb\n");
        let body = read(&path(&home, &["gamelib.log"]));
        assert_eq!(
            body.matches("log rotation failed for game:").count(),
            1,
            "{body}"
        );
    }

    #[test]
    fn five_thousand_log_calls_into_a_stalled_writer_never_block_and_are_counted() {
        let home = FakeHome::new("gamelib-log-");
        let logger = Logger::start(config(&home));
        let release = logger.hold();
        let began = Instant::now();
        for i in 0..5000 {
            logger.log(Prefix::Backend, Level::Info, &format!("line {i}"));
        }
        assert!(began.elapsed() < Duration::from_secs(5), "callers blocked");
        drop(release);
        assert!(logger.flush(GENEROUS));
        let body = read(&path(&home, &["gamelib.log"]));
        assert_eq!(
            body.matches("lines dropped (ingest full)").count(),
            1,
            "{body}"
        );
        assert!(body.contains("log writer: "));
        assert!(body.contains("line 0\n"));
    }

    #[test]
    fn a_flush_on_a_dead_writer_reports_false() {
        let home = FakeHome::new("gamelib-log-");
        let logger = Logger::start(config(&home));
        assert!(logger.flush(GENEROUS));
        assert!(!Logger::start(config(&home)).flush(Duration::ZERO));
    }
}

#[cfg(all(test, unix))]
mod mode {
    use super::test_support::*;
    use super::*;
    use gamelib_testutil::FakeHome;
    use std::os::unix::fs::PermissionsExt;

    fn mode_of(p: &str) -> u32 {
        fs::metadata(p).unwrap().permissions().mode() & 0o777
    }

    #[test]
    fn a_new_log_file_is_created_0600() {
        let home = FakeHome::new("gamelib-log-");
        let logger = Logger::start(config(&home));
        logger.submit(vec![batch(game("480"), true, vec![raw("x\n")])]);
        assert!(logger.flush(GENEROUS));
        assert_eq!(
            mode_of(&path(&home, &["games", "480_steam", "launch.log"])),
            0o600
        );
        assert_eq!(mode_of(&path(&home, &["gamelib.log"])), 0o600);
    }

    #[test]
    fn an_existing_file_keeps_its_mode_after_an_append() {
        let home = FakeHome::new("gamelib-log-");
        let launch = path(&home, &["games", "480_steam", "launch.log"]);
        fs::create_dir_all(Path::new(&launch).parent().unwrap()).unwrap();
        fs::write(&launch, "seed\n").unwrap();
        fs::set_permissions(&launch, fs::Permissions::from_mode(0o644)).unwrap();
        let logger = Logger::start(config(&home));
        // rotate false: appends to the existing 0644 file.
        logger.submit(vec![batch(game("480"), false, vec![raw("more\n")])]);
        assert!(logger.flush(GENEROUS));
        assert_eq!(read(&launch), "seed\nmore\n");
        assert_eq!(mode_of(&launch), 0o644);
    }
}

#[cfg(all(test, windows))]
mod windows {
    use super::test_support::*;
    use super::*;
    use gamelib_testutil::FakeHome;
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_SHARE_READ: u32 = 1;
    const FILE_SHARE_WRITE: u32 = 2;

    #[test]
    fn a_held_old_file_keeps_launch_log_in_place_and_logs_one_warning() {
        let home = FakeHome::new("gamelib-log-");
        let launch = path(&home, &["games", "480_steam", "launch.log"]);
        fs::create_dir_all(Path::new(&launch).parent().unwrap()).unwrap();
        fs::write(&launch, "previous\n").unwrap();
        let old = format!("{launch}.old");
        fs::write(&old, "held\n").unwrap();
        // Open without FILE_SHARE_DELETE: replacing it by rename is refused.
        let _held = OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .open(&old)
            .unwrap();
        let logger = Logger::start(config(&home));
        for text in ["a\n", "b\n"] {
            logger.submit(vec![batch(game("480"), true, vec![raw(text)])]);
        }
        assert!(logger.flush(GENEROUS));
        assert_eq!(read(&launch), "previous\na\nb\n");
        let body = read(&path(&home, &["gamelib.log"]));
        assert_eq!(
            body.matches("log rotation failed for game:").count(),
            1,
            "{body}"
        );
    }
}

#[cfg(test)]
mod second_init {
    use super::test_support::*;
    use super::*;
    use gamelib_testutil::FakeHome;

    /// The only unit test that touches the process-global logger.
    #[test]
    fn a_second_init_returns_false_and_never_rotates() {
        let home = FakeHome::new("gamelib-log-");
        let general = path(&home, &["gamelib.log"]);
        fs::write(&general, "from the last launch\n").unwrap();
        assert!(crate::init(config(&home)));
        crate::log(Prefix::Backend, Level::Info, "first");
        assert!(crate::flush(GENEROUS));
        assert_eq!(read(&format!("{general}.old")), "from the last launch\n");
        assert!(!crate::init(config(&home)));
        crate::log(Prefix::Backend, Level::Info, "second");
        assert!(crate::flush(GENEROUS));
        let body = read(&general);
        assert!(
            body.contains("first\n") && body.contains("second\n"),
            "{body}"
        );
        assert_eq!(read(&format!("{general}.old")), "from the last launch\n");
    }
}
