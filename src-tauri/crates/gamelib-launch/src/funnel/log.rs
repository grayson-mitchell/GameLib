//! The funnel's per-game launch log (88.3-04, D-29, and the end of the D-30 interim).
//!
//! The TS `LogWriter` (`logger/targetWriter.ts`) owned one game's `launch` log for the length of a launch: it
//! rotated the file once, on the first entry it accepted, and wrote a closing marker. Until 88.3 the TS facade
//! stayed the only rotator and handed the writer to Rust for one runner call at a time. The funnel now owns the
//! writer, so it is the one that rotates; the only other party that writes to the same log is the TS
//! `game.launch` the funnel hands the writer state to, and that hand-off says who still owes the rotation.
//!
//! The semantics copied from the TS writer:
//!
//! - a disabled writer sends nothing unless the write is forced, and never rotates unless a forced write
//!   claims the rotation;
//! - the first accepted entry carries the rotation (claimed synchronously, here simply before it is built);
//! - `close` writes the end-of-log marker (respecting disabled) and after it every write is dropped;
//! - a target the log writer would refuse sends nothing at all.
//!
//! Every line is fixed text chosen by the funnel; nothing here carries a path.

use std::sync::Arc;

use gamelib_log::frame::{target_of, FrameTarget};
use gamelib_log::{Entry, Level, Prefix, TargetBatch};
use serde::Serialize;
use serde_json::Value;

use crate::runner::stream::LaunchLogSink;
use crate::runner::RunnerName;

/// The line the TS writer's `close()` writes.
pub const END_OF_LOG: &str = "============= End of log =============";

/// `stringifyLogValue` for a value that is not a Promise or an `Error`: what a writer's `logInfo(message)` turns
/// its argument into. A string is itself, an array is its elements joined with a space, a number or boolean its
/// text, and anything else (`null`, an object) `JSON.stringify(value, null, 2)`.
pub fn stringify_log_value(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        Value::Array(items) => items
            .iter()
            .map(stringify_log_value)
            .collect::<Vec<_>>()
            .join(" "),
        other => serde_json::to_string_pretty(other).unwrap_or_default(),
    }
}

/// The `LogFrameTarget` wire shape of a game's launch log: `{ kind: 'game', appName, runner, type: 'launch' }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogTargetWire {
    pub kind: &'static str,
    pub app_name: String,
    pub runner: &'static str,
    #[serde(rename = "type")]
    pub log_type: &'static str,
}

/// The writer state handed to the TS `launch` hook (`LogHandOff` in `targetWriter.ts`): the typed target, the
/// writer's own switch, and whether the rotation is still owed, which is true only when the writer is not
/// disabled and nobody has claimed it yet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LogHandOffWire {
    pub target: LogTargetWire,
    pub disabled: bool,
    pub rotate: bool,
}

impl LogHandOffWire {
    /// The same hand-off as the runner's typed form (`launch_script_run`'s `logTarget`).
    pub fn to_runner_hand_off(&self) -> crate::runner::stream::LogHandOff {
        crate::runner::stream::LogHandOff {
            target: FrameTarget {
                kind: self.target.kind.to_string(),
                app_name: Some(self.target.app_name.clone()),
                runner: Some(self.target.runner.to_string()),
                log_type: Some(self.target.log_type.to_string()),
            },
            disabled: self.disabled,
            rotate: self.rotate,
        }
    }
}

/// One game's launch log.
pub struct LaunchLog {
    sink: Arc<dyn LaunchLogSink>,
    target: LogTargetWire,
    /// `None` for a target the log writer refuses: the writer sends nothing at all.
    resolved: Option<gamelib_core::paths::LogTarget>,
    disabled: bool,
    rotate_owed: bool,
    closed: bool,
}

impl LaunchLog {
    /// `createGameLogWriter(appName, runner, 'launch', { disableLogs, verboseLogs })`: disabled by the global
    /// switch, or by the game's own `verboseLogs` being off.
    pub fn open(
        sink: Arc<dyn LaunchLogSink>,
        app_name: &str,
        runner: RunnerName,
        disable_logs: bool,
        verbose_logs: bool,
    ) -> LaunchLog {
        let resolved = target_of(FrameTarget {
            kind: "game".to_string(),
            app_name: Some(app_name.to_string()),
            runner: Some(runner.as_str().to_string()),
            log_type: Some("launch".to_string()),
        })
        .ok();
        LaunchLog {
            sink,
            target: LogTargetWire {
                kind: "game",
                app_name: app_name.to_string(),
                runner: runner.as_str(),
                log_type: "launch",
            },
            resolved,
            disabled: disable_logs || !verbose_logs,
            rotate_owed: true,
            closed: false,
        }
    }

    /// The writer of a game's launch log that is only ever appended to (88.3-09, D-09): a re-adopted game's
    /// session continues the log the crashed GameLib was writing, so nothing owes a rotation and nothing here
    /// ever claims one. Never disabled: the lines written through it are the funnel's own notes.
    pub fn open_appending(
        sink: Arc<dyn LaunchLogSink>,
        app_name: &str,
        runner: RunnerName,
    ) -> LaunchLog {
        let mut log = LaunchLog::open(sink, app_name, runner, false, true);
        log.rotate_owed = false;
        log
    }

    /// The rotation for the entry being accepted now: true exactly once.
    fn claim_rotate(&mut self) -> bool {
        std::mem::take(&mut self.rotate_owed)
    }

    fn accepts(&self, force: bool) -> bool {
        !self.closed && self.resolved.is_some() && (!self.disabled || force)
    }

    fn submit(&mut self, entry: Entry) {
        let rotate = self.claim_rotate();
        if let Some(target) = &self.resolved {
            self.sink.submit(vec![TargetBatch {
                target: target.clone(),
                rotate,
                entries: vec![entry],
            }]);
        }
    }

    /// A raw chunk (`writeString`).
    pub fn write_raw(&mut self, text: &str, force: bool) {
        if !self.accepts(force) {
            return;
        }
        self.submit(Entry::Raw(text.to_string()));
    }

    /// One structured line (`logWarning(message, { forceLog })` and its siblings), stamped now.
    pub fn write_line(&mut self, level: Level, prefix: Prefix, msg: &str, force: bool) {
        if !self.accepts(force) {
            return;
        }
        let (ts, tz) = self.sink.stamp();
        self.submit(Entry::Line {
            ts,
            tz,
            level,
            prefix,
            msg: msg.to_string(),
        });
    }

    /// One entry of a prepare step's log (`writeLaunchLog`): the writer method named by `level`, called with the
    /// entry's first part, which is the only argument the TS passed on.
    pub fn write_entry(&mut self, level: &str, parts: &[Value]) {
        let level = match level {
            "warning" => Level::Warning,
            "error" => Level::Error,
            "debug" => Level::Debug,
            _ => Level::Info,
        };
        let text = parts
            .first()
            .map_or_else(|| "undefined".to_string(), stringify_log_value);
        self.write_line(level, Prefix::General, &text, false);
    }

    /// `LogWriter.handOff()` without the claim: what the `launch` hook is told. A writer that is closed or that
    /// the log writer would refuse is handed over as disabled (the TS answered `null` and the manager wrote
    /// nothing; a disabled writer says the same), and a disabled writer never owes the rotation.
    pub fn hand_off(&self) -> LogHandOffWire {
        let disabled = self.disabled || self.closed || self.resolved.is_none();
        LogHandOffWire {
            target: self.target.clone(),
            disabled,
            rotate: !disabled && self.rotate_owed,
        }
    }

    /// Takes the writer back after the hook: `rotated` is the hook's answer to whether its facade claimed the
    /// rotation this writer handed over, so the funnel never rotates a log the manager already rotated.
    pub fn take_back(&mut self, rotated: bool) {
        if rotated {
            self.rotate_owed = false;
        }
    }

    /// `close()`: the end-of-log marker, respecting disabled. Every later write is dropped.
    pub fn close(&mut self) {
        self.write_raw(END_OF_LOG, false);
        self.closed = true;
    }

    pub fn is_disabled(&self) -> bool {
        self.disabled
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    struct Sink {
        batches: Mutex<Vec<TargetBatch>>,
    }

    impl LaunchLogSink for Sink {
        fn stamp(&self) -> (u64, i32) {
            (0, 0)
        }
        fn submit(&self, batches: Vec<TargetBatch>) {
            self.batches.lock().unwrap().extend(batches);
        }
        fn general(&self, _prefix: Prefix, _level: Level, _msg: &str) {}
    }

    fn open(disable: bool, verbose: bool) -> (LaunchLog, Arc<Sink>) {
        let sink = Arc::new(Sink::default());
        let log = LaunchLog::open(
            sink.clone(),
            "alpha",
            RunnerName::Legendary,
            disable,
            verbose,
        );
        (log, sink)
    }

    #[test]
    fn the_first_accepted_entry_claims_the_rotation_and_no_other_does() {
        let (mut log, sink) = open(false, true);
        log.write_raw("one", false);
        log.write_raw("two", false);
        let batches = sink.batches.lock().unwrap();
        assert_eq!(batches.len(), 2);
        assert!(batches[0].rotate);
        assert!(!batches[1].rotate);
    }

    #[test]
    fn a_disabled_writer_sends_nothing_unless_forced_and_a_forced_write_claims_the_rotation() {
        let (mut log, sink) = open(false, false);
        log.write_raw("quiet", false);
        assert!(sink.batches.lock().unwrap().is_empty());
        log.write_line(Level::Warning, Prefix::General, "loud", true);
        log.write_raw("quiet again", false);
        let batches = sink.batches.lock().unwrap();
        assert_eq!(batches.len(), 1);
        assert!(batches[0].rotate);
    }

    #[test]
    fn the_hand_off_owes_the_rotation_only_while_enabled_and_unclaimed() {
        let (log, _) = open(false, true);
        assert!(log.hand_off().rotate);
        let (log, _) = open(true, true);
        let wire = log.hand_off();
        assert!(wire.disabled);
        assert!(!wire.rotate, "a disabled writer never owes a rotation");
    }

    #[test]
    fn a_rotation_the_hook_claimed_is_not_claimed_again_by_the_close() {
        let (mut log, sink) = open(false, true);
        assert!(log.hand_off().rotate);
        log.take_back(true);
        log.close();
        let batches = sink.batches.lock().unwrap();
        assert_eq!(batches.len(), 1);
        assert!(!batches[0].rotate);
        assert!(matches!(&batches[0].entries[0], Entry::Raw(text) if text == END_OF_LOG));
    }

    #[test]
    fn a_rotation_the_hook_left_owed_goes_on_the_closing_marker() {
        let (mut log, sink) = open(false, true);
        log.take_back(false);
        log.close();
        assert!(sink.batches.lock().unwrap()[0].rotate);
    }

    #[test]
    fn a_closed_writer_drops_every_write_and_hands_off_nothing() {
        let (mut log, sink) = open(false, true);
        log.close();
        log.write_raw("late", true);
        assert_eq!(sink.batches.lock().unwrap().len(), 1);
        let wire = log.hand_off();
        assert!(
            wire.disabled && !wire.rotate,
            "a closed writer is handed over disabled"
        );
    }
}
