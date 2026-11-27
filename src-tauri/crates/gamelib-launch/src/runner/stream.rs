//! What the runner writes to and reads from while a child runs: the log hand-off (the caller's log
//! writers, as typed targets), the log sink they go through, the output sink a caller that watches the
//! stream is given, and the 50-chunk window the result is built from (88.2-07, D-02, D-30 interim).
//!
//! Every log entry here is a `gamelib_log` entry for a typed target, never a path; the sink is the one
//! seam, so the app writes through `gamelib-log` and a test records.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use gamelib_core::clock::Clock;
use gamelib_core::paths::LogTarget;
use gamelib_core::process::Pipe;
use gamelib_engine::sinks::EngineUi;
use gamelib_log::format::is_js_space;
use gamelib_log::frame::{target_of, FrameTarget};
use gamelib_log::{Level, Prefix, SystemTz, TargetBatch, TzOffset};
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Where log entries go. The app's is [`GamelibLogSink`]; a test's records what it was given.
pub trait LaunchLogSink: Send + Sync {
    /// The timestamp and local offset in minutes a structured line is stamped with, taken now.
    fn stamp(&self) -> (u64, i32);
    /// Hands batches to the log writer, in order.
    fn submit(&self, batches: Vec<TargetBatch>);
    /// A line for the general log (`gamelib.log`). The message is one line: a CR or LF in it is escaped.
    fn general(&self, prefix: Prefix, level: Level, msg: &str);
}

/// The sink over the process-wide `gamelib-log` writer. Does nothing before the writer is started.
pub struct GamelibLogSink {
    clock: Arc<dyn Clock>,
}

impl GamelibLogSink {
    pub fn new(clock: Arc<dyn Clock>) -> GamelibLogSink {
        GamelibLogSink { clock }
    }
}

impl LaunchLogSink for GamelibLogSink {
    fn stamp(&self) -> (u64, i32) {
        let now = self.clock.now_ms();
        (now, SystemTz.offset_minutes(now))
    }

    fn submit(&self, batches: Vec<TargetBatch>) {
        gamelib_log::submit(batches);
    }

    fn general(&self, prefix: Prefix, level: Level, msg: &str) {
        gamelib_log::log(prefix, level, msg);
    }
}

/// One log writer of the caller, as the sidecar hands it over: the typed target (the `LogFrameTarget`
/// shape, a validated name and never a path), whether its logs are disabled, and whether its rotation
/// is still owed.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LogHandOff {
    pub target: FrameTarget,
    /// A disabled writer is never written to (and never rotates).
    #[serde(default)]
    pub disabled: bool,
    /// The writer's first accepted entry must carry the rotate flag. Rust sets it on the first entry it
    /// writes to this target and on no other.
    #[serde(default)]
    pub rotate: bool,
}

/// One target this call writes to, with the rotation it still owes.
#[derive(Debug)]
pub struct LogOut {
    target: LogTarget,
    rotate_owed: bool,
}

/// The targets of one call, resolved: a disabled writer and a target the log writer would refuse are
/// dropped here, so nothing below needs to ask again.
#[derive(Debug, Default)]
pub struct LogTargets {
    outs: Vec<LogOut>,
}

impl LogTargets {
    pub fn resolve(hand_off: Vec<LogHandOff>) -> LogTargets {
        let outs = hand_off
            .into_iter()
            .filter(|h| !h.disabled)
            .filter_map(|h| {
                target_of(h.target).ok().map(|target| LogOut {
                    target,
                    rotate_owed: h.rotate,
                })
            })
            .collect();
        LogTargets { outs }
    }

    pub fn is_empty(&self) -> bool {
        self.outs.is_empty()
    }

    /// One batch per target, each holding the entries `entries_for` builds for it, with the rotation
    /// claimed on the target's first batch only.
    pub fn batches<F>(&mut self, mut entries_for: F) -> Vec<TargetBatch>
    where
        F: FnMut(usize) -> Vec<gamelib_log::Entry>,
    {
        let mut out = Vec::with_capacity(self.outs.len());
        for (index, target) in self.outs.iter_mut().enumerate() {
            let entries = entries_for(index);
            if entries.is_empty() {
                continue;
            }
            let rotate = std::mem::take(&mut target.rotate_owed);
            out.push(TargetBatch {
                target: target.target.clone(),
                rotate,
                entries,
            });
        }
        out
    }

    pub fn len(&self) -> usize {
        self.outs.len()
    }
}

/// Watches a run's output. Chunks arrive raw, in the order the pipes delivered them.
pub trait OutputSink: Send + Sync {
    fn chunk(&self, pipe: Pipe, text: &str);
    /// The child's pid, when the spawn seam reports one. The helper path has none (the spawn seam does
    /// not report a pid), so only the game path (88.2-10) calls this.
    fn spawned(&self, _pid: u32) {}
}

/// Drops everything: a caller that does not watch the stream.
pub struct NullSink;

impl OutputSink for NullSink {
    fn chunk(&self, _pipe: Pipe, _text: &str) {}
}

/// Sends each chunk to the sidecar as a `runnerOutput` frame, `[{ streamId, seq, pipe, chunk }]`, and a
/// spawn as `runnerSpawned`, `[{ streamId, pid }]`, so the TS caller's `onOutput` runs.
pub struct UiOutputSink {
    ui: Arc<dyn EngineUi>,
    stream_id: String,
    seq: AtomicU64,
}

impl UiOutputSink {
    pub fn new(ui: Arc<dyn EngineUi>, stream_id: String) -> UiOutputSink {
        UiOutputSink {
            ui,
            stream_id,
            seq: AtomicU64::new(0),
        }
    }
}

impl OutputSink for UiOutputSink {
    fn chunk(&self, pipe: Pipe, text: &str) {
        let seq = self.seq.fetch_add(1, Ordering::SeqCst);
        let pipe = match pipe {
            Pipe::Stdout => "stdout",
            Pipe::Stderr => "stderr",
        };
        self.ui.send_to_sidecar(
            "runnerOutput",
            vec![json!({ "streamId": self.stream_id, "seq": seq, "pipe": pipe, "chunk": text })],
        );
    }

    fn spawned(&self, pid: u32) {
        self.ui.send_to_sidecar(
            "runnerSpawned",
            vec![json!({ "streamId": self.stream_id, "pid": pid })],
        );
    }
}

/// How many chunks a result keeps.
pub const WINDOW_CHUNKS: usize = 50;

/// `memoryLog`: the last [`WINDOW_CHUNKS`] chunks (a chunk, not a line and not a byte count; a chunk
/// may be multi-line, and a run that writes more than 64 KiB in one read keeps all of it).
#[derive(Debug, Default)]
pub struct ChunkWindow {
    chunks: VecDeque<String>,
}

impl ChunkWindow {
    pub fn new() -> ChunkWindow {
        ChunkWindow::default()
    }

    /// Keeps `chunk` as is.
    pub fn push_raw(&mut self, chunk: &str) {
        self.chunks.push_back(chunk.to_string());
        if self.chunks.len() > WINDOW_CHUNKS {
            self.chunks.pop_front();
        }
    }

    /// Keeps `chunk` with the whitespace JavaScript's `trim` strips taken off both ends (a blank chunk
    /// is kept as an empty one, so it still takes a place in the window).
    pub fn push_trimmed(&mut self, chunk: &str) {
        self.push_raw(chunk.trim_matches(is_js_space));
    }

    /// The window oldest first, joined by `separator`.
    pub fn join(&self, separator: &str) -> String {
        self.chunks
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(separator)
    }

    pub fn len(&self) -> usize {
        self.chunks.len()
    }

    pub fn is_empty(&self) -> bool {
        self.chunks.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_window_keeps_the_last_fifty_chunks_oldest_first() {
        let mut window = ChunkWindow::new();
        for i in 0..60 {
            window.push_raw(&i.to_string());
        }
        assert_eq!(window.len(), 50);
        assert!(window.join(",").starts_with("10,11,"));
        assert!(window.join(",").ends_with(",59"));
    }

    #[test]
    fn a_trimmed_push_strips_js_whitespace_and_keeps_a_blank_chunk_as_a_place() {
        let mut window = ChunkWindow::new();
        window.push_trimmed("  a\n");
        window.push_trimmed("\n \n");
        window.push_trimmed("\u{0085}b\u{FEFF}");
        assert_eq!(window.len(), 3);
        // U+0085 is not JS whitespace, U+FEFF is.
        assert_eq!(window.join("|"), "a||\u{0085}b");
    }

    #[test]
    fn a_disabled_or_refused_target_is_dropped_and_rotation_goes_on_the_first_batch_only() {
        let hand = |kind: &str, disabled: bool, rotate: bool| LogHandOff {
            target: FrameTarget {
                kind: kind.to_string(),
                app_name: None,
                runner: (kind == "runner").then(|| "legendary".to_string()),
                log_type: None,
            },
            disabled,
            rotate,
        };
        let mut targets = LogTargets::resolve(vec![
            hand("runner", true, true),
            hand("runner", false, true),
            hand("bogus", false, true),
        ]);
        assert_eq!(targets.len(), 1);
        let raw = |_: usize| vec![gamelib_log::Entry::Raw("x".to_string())];
        let first = targets.batches(raw);
        let second = targets.batches(raw);
        assert!(first[0].rotate);
        assert!(!second[0].rotate);
    }
}
