//! Replay seams for the golden tests and any CLI: a scripted [`SpecRunner`] that records every spawn
//! and answers a canned output. Never part of a release build (feature `testing`).

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};

use crate::ctx::ShortcutsUi;

/// One spawn a [`ScriptedRunner`] saw: the fields of the [`ProcSpec`] a golden pins.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordedSpawn {
    pub label: &'static str,
    pub program: String,
    pub argv: Vec<String>,
    pub env: Vec<(String, String)>,
    pub replace_env: bool,
    pub cwd: Option<PathBuf>,
    pub stdin: Option<String>,
    pub timeout: Option<Duration>,
    pub hide_window: bool,
}

/// A [`SpecRunner`] that answers every spawn with the same output and records it.
pub struct ScriptedRunner {
    answer: SpecOutput,
    spawns: Mutex<Vec<RecordedSpawn>>,
}

impl ScriptedRunner {
    /// Answers `answer` to every spawn.
    pub fn answering(answer: SpecOutput) -> ScriptedRunner {
        ScriptedRunner {
            answer,
            spawns: Mutex::new(Vec::new()),
        }
    }

    /// Every spawn seen so far, in order.
    pub fn spawns(&self) -> Vec<RecordedSpawn> {
        match self.spawns.lock() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }
}

impl SpecRunner for ScriptedRunner {
    fn run(&self, spec: ProcSpec, _on_line: Option<LineSink>) -> BoxFuture<SpecOutput> {
        let recorded = RecordedSpawn {
            label: spec.label,
            program: spec.program,
            argv: spec.argv,
            env: spec.env,
            replace_env: spec.replace_env,
            cwd: spec.cwd,
            stdin: spec.stdin,
            timeout: spec.timeout,
            hide_window: spec.hide_window,
        };
        match self.spawns.lock() {
            Ok(mut guard) => guard.push(recorded),
            Err(poisoned) => poisoned.into_inner().push(recorded),
        }
        let answer = self.answer.clone();
        Box::pin(async move { answer })
    }
}

/// A [`ShortcutsUi`] that keeps every notification and dialog it was asked for, `(title, body)` and
/// `(title, body, kind)`, in order.
#[derive(Default)]
pub struct RecordingUi {
    notices: Mutex<Vec<(String, String)>>,
    dialogs: Mutex<Vec<(String, String, String)>>,
}

impl RecordingUi {
    /// Every `(title, body)` notification, in order.
    pub fn notices(&self) -> Vec<(String, String)> {
        match self.notices.lock() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }

    /// Every `(title, body, kind)` dialog, in order.
    pub fn dialogs(&self) -> Vec<(String, String, String)> {
        match self.dialogs.lock() {
            Ok(guard) => guard.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }
}

impl ShortcutsUi for RecordingUi {
    fn notify(&self, title: &str, body: &str) {
        let entry = (title.to_string(), body.to_string());
        match self.notices.lock() {
            Ok(mut guard) => guard.push(entry),
            Err(poisoned) => poisoned.into_inner().push(entry),
        }
    }

    fn show_dialog(&self, title: &str, body: &str, kind: &str) {
        let entry = (title.to_string(), body.to_string(), kind.to_string());
        match self.dialogs.lock() {
            Ok(mut guard) => guard.push(entry),
            Err(poisoned) => poisoned.into_inner().push(entry),
        }
    }
}
