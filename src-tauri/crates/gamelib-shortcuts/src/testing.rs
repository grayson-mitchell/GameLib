//! Replay seams for the golden tests and any CLI: a scripted [`SpecRunner`] that records every spawn
//! and answers a canned output. Never part of a release build (feature `testing`).

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use gamelib_core::process::{BoxFuture, LineSink, ProcSpec, SpecOutput, SpecRunner};

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
